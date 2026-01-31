"use strict";
const express = require("express");
const { apiKey, permission } = require("../auth/checkAuth");
const router = express.Router();

// Check API key cho tất cả routes
router.use(apiKey);
router.use(permission("0000"));

// Mount sub-routes
router.use("/auth", require("./access/access.route"));
router.use("/user", require("./user/user.route"));

module.exports = router;
