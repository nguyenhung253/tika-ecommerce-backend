"use strict";
const express = require("express");
const { apiKey, permission } = require("../auth/checkAuth");
const router = express.Router();

// Check API key cho tất cả routes
router.use(apiKey);
router.use(permission("read"));

// Mount sub-routes
router.use("/auth", require("./access"));

router.use("/product", require("./product"));
module.exports = router;
