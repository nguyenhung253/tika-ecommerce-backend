"use strict";

const getPositiveIntegerFromEnv = (envName, defaultValue) => {
  const rawEnvValue = process.env[envName];
  if (!rawEnvValue) {
    return defaultValue;
  }

  const parsedValue = Number.parseInt(rawEnvValue, 10);
  if (Number.isNaN(parsedValue) || parsedValue <= 0) {
    return defaultValue;
  }

  return parsedValue;
};

module.exports = {
  getPositiveIntegerFromEnv,
};
