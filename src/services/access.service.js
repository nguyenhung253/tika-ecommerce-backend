"use strict";
const bcrypt = require("bcrypt");
const User = require("../models/user.model");
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
const VALID_ROLES = ["shop", "customer", "admin"];

class AccessService {
  static signUp = async ({ name, email, password, role = "customer" }) => {
    // Check if user already exists
    const existingUser = await User.findOne({ email }).lean();
    if (existingUser) {
      throw new ConflictRequestError("User already exists");
    }

    // Validate role
    if (!VALID_ROLES.includes(role)) {
      throw new BadRequestError("Invalid role");
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
    };

    // Generate tokens
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save refresh token to database
    const refreshTokenExpire = process.env.REFRESH_TOKEN_EXPIRE || "7d";
    const expiresAt = parseTokenExpiry(refreshTokenExpire);

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

  static login = async ({ email, password }) => {
    const user = await User.findOne({ email });
    if (!user) {
      throw new BadRequestError("Email or password incorrect");
    }

    // Check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new BadRequestError("Email or password incorrect");
    }

    // Create token payload
    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
    };

    // Generate tokens
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save refresh token to database
    const refreshTokenExpire = process.env.REFRESH_TOKEN_EXPIRE || "7d";
    const expiresAt = parseTokenExpiry(refreshTokenExpire);

    await TokenService.saveRefreshToken({
      userId: user._id,
      refreshToken,
      expiresAt,
    });

    return {
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
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

    return { message: "Logout successful" };
  };

  // Logout all devices - blacklist all user tokens
  static logoutAll = async ({ userId }) => {
    await TokenService.blacklistAllUserTokens(userId);

    return { message: "Logged out from all devices" };
  };

  // Refresh access token
  static refreshToken = async ({ userId, oldRefreshToken }) => {
    const user = await User.findById(userId);
    if (!user) {
      throw new BadRequestError("User not found");
    }

    // Blacklist old refresh token
    await TokenService.blacklistToken(oldRefreshToken);

    // Create new token payload
    const payload = {
      id: user._id,
      email: user.email,
      role: user.role,
    };

    // Generate new tokens
    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Save new refresh token
    const refreshTokenExpire = process.env.REFRESH_TOKEN_EXPIRE || "7d";
    const expiresAt = parseTokenExpiry(refreshTokenExpire);

    await TokenService.saveRefreshToken({
      userId: user._id,
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
}

module.exports = AccessService;
