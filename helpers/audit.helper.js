"use strict";

const logAuditEvent = (eventName, metadata = {}) => {
  const payload = {
    level: "audit",
    event: eventName,
    timestamp: new Date().toISOString(),
    metadata,
  };

  console.info(JSON.stringify(payload));
};

module.exports = {
  logAuditEvent,
};
