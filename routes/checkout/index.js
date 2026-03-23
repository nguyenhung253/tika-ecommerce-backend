"use strict";

const express = require("express");
const CheckoutController = require("../../controllers/checkout.controller");
const asyncHandler = require("../../helpers/asyncHandler");
const { authentication, requireRole } = require("../../auth/authentication");
const router = express.Router();

// All checkout routes require authentication
router.use(authentication);

router.post(
  "/review",
  requireRole("customer", "admin"),
  asyncHandler(CheckoutController.checkoutReview),
);

router.post(
  "/order",
  requireRole("customer", "admin"),
  asyncHandler(CheckoutController.orderByUser),
);

router.get(
  "/orders",
  requireRole("customer", "admin"),
  asyncHandler(CheckoutController.getOrdersByUser),
);

router.get(
  "/orders/:orderId",
  requireRole("customer", "admin"),
  asyncHandler(CheckoutController.getOneOrderByUser),
);

router.post(
  "/orders/:orderId/cancel",
  requireRole("customer", "admin"),
  asyncHandler(CheckoutController.cancelOrderByUser),
);

// Shop routes
router.patch(
  "/orders/:orderId/status",
  requireRole("shop"),
  asyncHandler(CheckoutController.updateOrderStatusByShop),
);

module.exports = router;
