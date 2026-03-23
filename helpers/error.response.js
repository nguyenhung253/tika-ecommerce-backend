"use strict";

const StatusCode = {
  FORBIDDEN: 403,
  CONFLICT: 409,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  TOO_MANY_REQUESTS: 429,
};

const ReasonStatusCode = {
  FORBIDDEN: "Forbidden Error",
  CONFLICT: "Conflict Error",
  BAD_REQUEST: "Bad Request Error",
  UNAUTHORIZED: "Unauthorized Error",
  NOT_FOUND: "Not Found Error",
  TOO_MANY_REQUESTS: "Too Many Requests",
};

class ErrorResponse extends Error {
  constructor(message, status, errorCode = "APP_ERROR") {
    super(message);
    this.status = status;
    this.errorCode = errorCode;
  }
}

class ConflictRequestError extends ErrorResponse {
  constructor(
    message = ReasonStatusCode.CONFLICT,
    statusCode = StatusCode.CONFLICT,
    errorCode = "CONFLICT_ERROR",
  ) {
    super(message, statusCode, errorCode);
  }
}

class BadRequestError extends ErrorResponse {
  constructor(
    message = ReasonStatusCode.BAD_REQUEST,
    statusCode = StatusCode.BAD_REQUEST,
    errorCode = "BAD_REQUEST_ERROR",
  ) {
    super(message, statusCode, errorCode);
  }
}

class ForbiddenRequestError extends ErrorResponse {
  constructor(
    message = ReasonStatusCode.FORBIDDEN,
    statusCode = StatusCode.FORBIDDEN,
    errorCode = "FORBIDDEN_ERROR",
  ) {
    super(message, statusCode, errorCode);
  }
}

class UnauthorizedRequestError extends ErrorResponse {
  constructor(
    message = ReasonStatusCode.UNAUTHORIZED,
    statusCode = StatusCode.UNAUTHORIZED,
    errorCode = "UNAUTHORIZED_ERROR",
  ) {
    super(message, statusCode, errorCode);
  }
}

class NotFoundError extends ErrorResponse {
  constructor(
    message = ReasonStatusCode.NOT_FOUND,
    statusCode = StatusCode.NOT_FOUND,
    errorCode = "NOT_FOUND_ERROR",
  ) {
    super(message, statusCode, errorCode);
  }
}

class TooManyRequestsError extends ErrorResponse {
  constructor(
    message = ReasonStatusCode.TOO_MANY_REQUESTS,
    statusCode = StatusCode.TOO_MANY_REQUESTS,
    errorCode = "TOO_MANY_REQUESTS_ERROR",
  ) {
    super(message, statusCode, errorCode);
  }
}

module.exports = {
  ConflictRequestError,
  BadRequestError,
  ForbiddenRequestError,
  UnauthorizedRequestError,
  NotFoundError,
  TooManyRequestsError,
};
