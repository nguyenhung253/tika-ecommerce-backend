"use strict";

const express = require("express");
const ProductController = require("../../controllers/product.controller");
const asyncHandler = require("../../helpers/asyncHandler");
const { authentication, requireRole } = require("../../auth/authentication");
const router = express.Router();

// All product routes require authentication
router.use(authentication);

// Create product - only shop can create
router.post(
  "",
  requireRole("shop"),
  asyncHandler(ProductController.createProduct),
);

module.exports = router;
