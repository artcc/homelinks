const path = require("path");

require("dotenv").config();

const baseDir = path.join(__dirname, "..", "..");
const port = process.env.PORT || 9500;
const uploadDir = process.env.UPLOAD_DIR || path.join(baseDir, "data", "uploads");
const maxImageSize = Number(process.env.MAX_IMAGE_SIZE || 1024);
const maxImageBytes = Number(process.env.MAX_IMAGE_BYTES || 1048576);
if (![maxImageSize, maxImageBytes].every((value) => Number.isSafeInteger(value) && value > 0)) {
  throw new Error("MAX_IMAGE_SIZE and MAX_IMAGE_BYTES must be positive integers");
}
const sessionSecret = process.env.SESSION_SECRET || "change-me";
const adminEmail = process.env.ADMIN_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD;
const cookieSecure = process.env.COOKIE_SECURE === "true";
const trustProxy = process.env.TRUST_PROXY === "true";

module.exports = {
  baseDir,
  port,
  uploadDir,
  maxImageSize,
  maxImageBytes,
  sessionSecret,
  adminEmail,
  adminPassword,
  cookieSecure,
  trustProxy,
};
