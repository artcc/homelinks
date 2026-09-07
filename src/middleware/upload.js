const multer = require("multer");
const path = require("path");
const { uploadDir, maxImageBytes } = require("../config/env");

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: maxImageBytes },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.mimetype) || ![".jpg", ".jpeg", ".png", ".webp"].includes(path.extname(file.originalname).toLowerCase())) {
      return cb(new Error("Only jpg, png, and webp images are allowed"));
    }
    cb(null, true);
  },
});

const uploadImage = (req, res, next) => {
  upload.single("image")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: `Image must be <= ${maxImageBytes} bytes` });
    }
    return res.status(400).json({ error: err.message || "Upload failed" });
  });
};

module.exports = {
  uploadImage,
};
