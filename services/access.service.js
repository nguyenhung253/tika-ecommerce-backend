"use strict";
const bcrypt = require("bcrypt");
const User = require("../models/user.model");
const Shop = require("../models/shop.model");
const {
  BadRequestError,
  ConflictRequestError,
} = require("../helpers/error.response");
const {
  generateAccessToken,
  generateRefreshToken,
} = require("../utils/authToken");
const TokenService = require("./token.service");
const { parseTokenExpiry } = require("../utils/tokenExpiry");
const otpGenerator = require("otp-generator");
const crypto = require("crypto");
const {
  getCache,
  setCache,
  deleteCache,
} = require("../utils/cache/cache.service");
const CacheKeys = require("../utils/cache/cache.keys");
const { sendOTP } = require("../configs/init.mailer");
const { logAuditEvent } = require("../helpers/audit.helper");
const {
  LOGIN_FAIL_MAX_ATTEMPTS,
  LOGIN_FAIL_WINDOW_SECONDS,
  LOGIN_FAIL_BLOCK_SECONDS,
  OTP_TTL_SECONDS,
  OTP_MAX_ATTEMPTS,
  VERIFIED_TTL_SECONDS,
  OTP_VERIFY_BLOCK_SECONDS,
  REFRESH_TOKEN_EXPIRE,
} = require("../configs/auth.config");
const USER_ROLES = ["customer", "admin"];
const ACCOUNT_TYPES = ["user", "shop"];

class AccessService {
  static getLoginFailKeys({ accountType, email }) {
    return {
      counterKey: CacheKeys.auth.loginFailCounter(accountType, email),
      blockKey: CacheKeys.auth.loginFailBlock(accountType, email),
    };
  }

  static async increaseLoginFailCounter({ accountType, email }) {
    const { counterKey, blockKey } = AccessService.getLoginFailKeys({
      accountType,
      email,
    });

    const cachedCounter = await getCache(counterKey);
    const nextAttempts = Number(cachedCounter?.attempts || 0) + 1;

    if (nextAttempts >= LOGIN_FAIL_MAX_ATTEMPTS) {
      await deleteCache(counterKey);
      await setCache(
        blockKey,
        {
          blocked: true,
        },
        LOGIN_FAIL_BLOCK_SECONDS,
      );
      return;
    }

    await setCache(
      counterKey,
      {
        attempts: nextAttempts,
      },
      LOGIN_FAIL_WINDOW_SECONDS,
    );
  }

  static async clearLoginFailCounter({ accountType, email }) {
    const { counterKey, blockKey } = AccessService.getLoginFailKeys({
      accountType,
      email,
    });
    await deleteCache(counterKey);
    await deleteCache(blockKey);
  }

  /**
   * Sign up for User (customer/admin)
   */
  static signUp = async ({ name, email, password, role = "customer" }) => {
    // Check if user already exists
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      throw new ConflictRequestError("User already exists");
    }

    // Validate role
    if (!USER_ROLES.includes(role)) {
      throw new BadRequestError(
        "Invalid role. Use signUpShop for shop registration.",
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = await User.create({
      name,
      email,
      password: passwordHash,
      role,
    });

    // Create token payload
    const payload = {
      id: newUser._id,
      email: newUser.email,
      role: newUser.role,
      accountType: "user",
    };

    // Generate tokens
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save refresh token to database
    const expiresAt = parseTokenExpiry(REFRESH_TOKEN_EXPIRE);

    await TokenService.saveRefreshToken({
      userId: newUser._id,
      refreshToken,
      expiresAt,
    });

    return {
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  };

  /**
   * Sign up for Shop
   */
  static signUpShop = async ({
    name,
    email,
    password,
    description = "",
    address = "",
  }) => {
    // Check if shop already exists
    const existingShop = await Shop.findOne({ email }).lean();
    if (existingShop) {
      throw new ConflictRequestError("Shop already exists");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    // Create new shop
    const newShop = await Shop.create({
      name,
      email,
      password: passwordHash,
      description,
      address,
    });

    // Create token payload
    const payload = {
      id: newShop._id,
      email: newShop.email,
      role: "shop",
      accountType: "shop",
    };

    // Generate tokens
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save refresh token to database
    const expiresAt = parseTokenExpiry(REFRESH_TOKEN_EXPIRE);

    await TokenService.saveRefreshToken({
      userId: newShop._id,
      refreshToken,
      expiresAt,
    });

    return {
      shop: {
        id: newShop._id,
        name: newShop.name,
        email: newShop.email,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  };

  static login = async ({ email, password, accountType = "user" }) => {
    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();
    const normalizedAccountType = accountType === "shop" ? "shop" : "user";

    const { blockKey } = AccessService.getLoginFailKeys({
      accountType: normalizedAccountType,
      email: normalizedEmail,
    });
    const loginBlocked = await getCache(blockKey);

    if (loginBlocked?.blocked) {
      logAuditEvent("auth.login.blocked", {
        email: normalizedEmail,
        accountType: normalizedAccountType,
      });
      throw new BadRequestError(
        "Too many failed login attempts. Please try again later",
      );
    }

    let account;
    let role;

    if (normalizedAccountType === "shop") {
      account = await Shop.findOne({ email: normalizedEmail });
      role = "shop";
    } else {
      account = await User.findOne({ email: normalizedEmail });
      role = account?.role;
    }

    if (!account) {
      await AccessService.increaseLoginFailCounter({
        accountType: normalizedAccountType,
        email: normalizedEmail,
      });

      logAuditEvent("auth.login.failed", {
        email: normalizedEmail,
        accountType: normalizedAccountType,
        reason: "account_not_found",
      });

      throw new BadRequestError("Email or password incorrect");
    }

    // Check password
    const isMatch = await bcrypt.compare(password, account.password);
    if (!isMatch) {
      await AccessService.increaseLoginFailCounter({
        accountType: normalizedAccountType,
        email: normalizedEmail,
      });

      logAuditEvent("auth.login.failed", {
        email: normalizedEmail,
        accountType: normalizedAccountType,
        reason: "password_mismatch",
      });

      throw new BadRequestError("Email or password incorrect");
    }

    await AccessService.clearLoginFailCounter({
      accountType: normalizedAccountType,
      email: normalizedEmail,
    });

    logAuditEvent("auth.login.success", {
      userId: String(account._id),
      email: normalizedEmail,
      accountType: normalizedAccountType,
      role,
    });

    // Create token payload
    const payload = {
      id: account._id,
      email: account.email,
      role: role,
      accountType: normalizedAccountType,
    };

    // Generate tokens
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save refresh token to database
    const expiresAt = parseTokenExpiry(REFRESH_TOKEN_EXPIRE);

    await TokenService.saveRefreshToken({
      userId: account._id,
      refreshToken,
      expiresAt,
    });

    return {
      [normalizedAccountType]: {
        id: account._id,
        name: account.name,
        email: account.email,
        role: role,
      },
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  };

  // Logout - blacklist current token
  static logout = async ({ refreshToken }) => {
    if (!refreshToken) {
      throw new BadRequestError("Refresh token is required");
    }

    await TokenService.blacklistToken(refreshToken);

    logAuditEvent("auth.refresh_token.revoked", {
      scope: "single_device",
    });

    return { message: "Logout successful" };
  };

  // Logout all devices - blacklist all user tokens
  static logoutAll = async ({ userId }) => {
    await TokenService.blacklistAllUserTokens(userId);

    logAuditEvent("auth.refresh_token.revoked", {
      scope: "all_devices",
      userId: String(userId),
    });

    return { message: "Logged out from all devices" };
  };

  // Refresh access token
  static refreshToken = async ({
    userId,
    oldRefreshToken,
    accountType = "user",
  }) => {
    let account;
    let role;

    if (accountType === "shop") {
      account = await Shop.findById(userId);
      role = "shop";
    } else {
      account = await User.findById(userId);
      role = account?.role;
    }

    if (!account) {
      throw new BadRequestError("Account not found");
    }

    // Blacklist old refresh token
    await TokenService.blacklistToken(oldRefreshToken);

    logAuditEvent("auth.refresh_token.revoked", {
      scope: "rotation",
      userId: String(userId),
      accountType,
    });

    // Create new token payload
    const payload = {
      id: account._id,
      email: account.email,
      role: role,
      accountType: accountType,
    };

    // Generate new tokens
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save new refresh token
    const expiresAt = parseTokenExpiry(REFRESH_TOKEN_EXPIRE);

    await TokenService.saveRefreshToken({
      userId: account._id,
      refreshToken,
      expiresAt,
    });

    return {
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  };

  static async forgotPassword({ email, accountType = "" }) {
    if (!email) {
      throw new BadRequestError("Email is required");
    }

    if (!ACCOUNT_TYPES.includes(accountType)) {
      throw new BadRequestError("Invalid account type");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const account =
      accountType === "shop"
        ? await Shop.findOne({ email: normalizedEmail }).lean()
        : await User.findOne({ email: normalizedEmail }).lean();

    // Always return a generic success message to avoid email enumeration.
    if (!account) {
      logAuditEvent("auth.forgot_password.request", {
        email: normalizedEmail,
        accountType,
        result: "ignored_account_not_found",
      });

      return {
        message: " OTP has been sent",
      };
    }

    const otp = otpGenerator.generate(6, {
      digits: true,
      upperCaseAlphabets: false,
      lowerCaseAlphabets: false,
      specialChars: false,
    });

    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    const otpKey = CacheKeys.auth.forgotPasswordOtp(
      accountType,
      normalizedEmail,
    );

    await setCache(
      otpKey,
      {
        otpHash,
        attempts: 0,
      },
      OTP_TTL_SECONDS,
    );

    await sendOTP(normalizedEmail, otp);

    logAuditEvent("auth.forgot_password.request", {
      email: normalizedEmail,
      accountType,
      result: "otp_sent",
    });

    return {
      message: "OTP has been sent",
    };
  }

  static async verifyForgotPasswordOtp({ email, accountType = "", otp }) {
    if (!email) {
      throw new BadRequestError("Email is required");
    }

    if (!otp) {
      throw new BadRequestError("OTP is required");
    }

    if (!ACCOUNT_TYPES.includes(accountType)) {
      throw new BadRequestError("Invalid account type");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const otpKey = CacheKeys.auth.forgotPasswordOtp(
      accountType,
      normalizedEmail,
    );
    const verifiedKey = CacheKeys.auth.forgotPasswordVerified(
      accountType,
      normalizedEmail,
    );
    const verifyBlockKey = CacheKeys.auth.forgotPasswordOtpVerifyBlock(
      accountType,
      normalizedEmail,
    );

    const verifyBlocked = await getCache(verifyBlockKey);
    if (verifyBlocked?.blocked) {
      logAuditEvent("auth.forgot_password.verify", {
        email: normalizedEmail,
        accountType,
        result: "blocked",
      });

      throw new BadRequestError(
        "Too many invalid OTP attempts. Please try again later",
      );
    }

    const otpData = await getCache(otpKey);
    if (!otpData || !otpData.otpHash) {
      throw new BadRequestError("OTP is invalid or expired");
    }

    const currentAttempts = Number(otpData.attempts || 0);
    if (currentAttempts >= OTP_MAX_ATTEMPTS) {
      await deleteCache(otpKey);
      await setCache(
        verifyBlockKey,
        {
          blocked: true,
        },
        OTP_VERIFY_BLOCK_SECONDS,
      );

      logAuditEvent("auth.forgot_password.verify", {
        email: normalizedEmail,
        accountType,
        result: "blocked_after_max_attempts",
      });

      throw new BadRequestError(
        "Too many invalid OTP attempts. Please try again later",
      );
    }

    const otpHash = crypto
      .createHash("sha256")
      .update(String(otp))
      .digest("hex");
    if (otpHash !== otpData.otpHash) {
      const nextAttempts = currentAttempts + 1;
      if (nextAttempts >= OTP_MAX_ATTEMPTS) {
        await deleteCache(otpKey);
        await setCache(
          verifyBlockKey,
          {
            blocked: true,
          },
          OTP_VERIFY_BLOCK_SECONDS,
        );

        logAuditEvent("auth.forgot_password.verify", {
          email: normalizedEmail,
          accountType,
          result: "blocked_after_invalid_otp",
        });

        throw new BadRequestError(
          "Too many invalid OTP attempts. Please try again later",
        );
      }

      await setCache(
        otpKey,
        {
          ...otpData,
          attempts: nextAttempts,
        },
        OTP_TTL_SECONDS,
      );

      logAuditEvent("auth.forgot_password.verify", {
        email: normalizedEmail,
        accountType,
        result: "invalid_otp",
        attempts: nextAttempts,
      });

      throw new BadRequestError("OTP is invalid or expired");
    }

    await deleteCache(otpKey);
    await setCache(
      verifiedKey,
      {
        verified: true,
      },
      VERIFIED_TTL_SECONDS,
    );

    logAuditEvent("auth.forgot_password.verify", {
      email: normalizedEmail,
      accountType,
      result: "success",
    });

    return {
      message: "OTP verified successfully",
    };
  }

  static async resetPasswordWithOtp({ email, accountType = "", newPassword }) {
    if (!email) {
      throw new BadRequestError("Email is required");
    }

    if (!newPassword) {
      throw new BadRequestError("New password is required");
    }

    if (!ACCOUNT_TYPES.includes(accountType)) {
      throw new BadRequestError("Invalid account type");
    }

    const normalizedEmail = email.trim().toLowerCase();
    const verifiedKey = CacheKeys.auth.forgotPasswordVerified(
      accountType,
      normalizedEmail,
    );
    const verification = await getCache(verifiedKey);

    if (!verification || !verification.verified) {
      throw new BadRequestError("OTP verification is required");
    }

    const Model = accountType === "shop" ? Shop : User;
    const account = await Model.findOne({ email: normalizedEmail });

    if (!account) {
      throw new BadRequestError("Account not found");
    }

    const isSamePassword = await bcrypt.compare(newPassword, account.password);
    if (isSamePassword) {
      throw new BadRequestError(
        "New password must be different from old password",
      );
    }

    account.password = await bcrypt.hash(newPassword, 10);
    await account.save();

    await deleteCache(verifiedKey);

    logAuditEvent("auth.forgot_password.reset", {
      accountId: String(account._id),
      email: normalizedEmail,
      accountType,
      result: "success",
    });

    return {
      message: "Password has been reset successfully",
    };
  }
}

module.exports = AccessService;
