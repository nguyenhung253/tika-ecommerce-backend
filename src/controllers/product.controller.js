"use strict";

const { SuccessResponse, CREATED } = require("../helpers/success.response");
const { ProductFactory } = require("../services/product.service");

class ProductController {
  static createProduct = async (req, res, next) => {
    return new CREATED({
      message: "Create new Product success",
      data: await ProductFactory.createProduct(req.body.product_type, {
        ...req.body,
        product_shop: req.user.id, // Lấy shop ID từ user đang login
      }),
    }).send(res);
  };
}

module.exports = ProductController;
