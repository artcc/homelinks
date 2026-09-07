const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");
const multer = require("multer");
const AdmZip = require("adm-zip");
const db = require("../db");
const { maxImageBytes, maxImageSize, uploadDir } = require("../config/env");
const { uploadImage } = require("../middleware/upload");
const { validateImage, removeUpload } = require("../services/uploads");

const router = express.Router();

const maxBackupBytes = 50 * 1024 * 1024;
const allowedImageExtensions = [".jpg", ".jpeg", ".png", ".webp"];

const importZipUpload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: maxBackupBytes },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const allowedMimeTypes = [
      "application/zip",
      "application/x-zip-compressed",
      "application/octet-stream",
    ];
    if (ext === ".zip" || allowedMimeTypes.includes(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error("Only ZIP files are allowed"));
  },
});

const uploadBackupZip = (req, res, next) => {
  importZipUpload.single("backup")(req, res, (err) => {
    if (!err) return next();
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({ error: "Backup ZIP must be <= 50MB" });
    }
    return res.status(400).json({ error: err.message || "Upload failed" });
  });
};

function toClientError(message) {
  const err = new Error(message);
  err.status = 400;
  return err;
}

async function removeUnusedUpload(imageUrl) {
  if (imageUrl && !(await db.listApps()).some((app) => app.image_url === imageUrl)) removeUpload(imageUrl);
}

function normalizeCategory(category) {
  if (!category || typeof category !== "string") return null;
  const value = category.trim();
  if (!value) return null;
  if (value.length > 50) {
    throw toClientError("Category must be 50 characters or less");
  }
  return value.toUpperCase();
}

function normalizeImportedApp(rawApp) {
  if (!rawApp || typeof rawApp !== "object") {
    throw toClientError("Invalid app entry in apps.json");
  }
  if (rawApp.favorite !== undefined && ![0, 1, false, true].includes(rawApp.favorite)) {
    throw toClientError("Invalid favorite value");
  }
  for (const field of ["category", "description", "image_url"]) {
    if (rawApp[field] !== undefined && rawApp[field] !== null && typeof rawApp[field] !== "string") throw toClientError(`Invalid ${field} value`);
  }

  const name = typeof rawApp.name === "string" ? rawApp.name.trim() : "";
  const url = typeof rawApp.url === "string" ? rawApp.url.trim() : "";

  if (!name || !url) {
    throw toClientError("Each app must include name and url");
  }
  if (!isValidUrl(url)) {
    throw toClientError(`Invalid URL format for app: ${name}`);
  }

  const description =
    typeof rawApp.description === "string" && rawApp.description.trim()
      ? rawApp.description.trim()
      : null;

  if (description && description.length > 500) {
    throw toClientError(`Description too long for app: ${name}`);
  }

  let imageUrl = null;
  if (typeof rawApp.image_url === "string" && rawApp.image_url.trim()) {
    const filename = path.basename(rawApp.image_url.trim());
    if (!filename || filename === "." || filename === "..") {
      throw toClientError(`Invalid image path for app: ${name}`);
    }
    imageUrl = `/uploads/${filename}`;
  }

  return {
    name,
    url,
    image_url: imageUrl,
    favorite: rawApp.favorite ? 1 : 0,
    category: normalizeCategory(rawApp.category),
    description,
    created_at:
      typeof rawApp.created_at === "string" && rawApp.created_at.trim()
        ? rawApp.created_at.trim()
        : new Date().toISOString(),
  };
}

// Validar formato de URL
function isValidUrl(string) {
  try {
    if (/^[a-z][a-z\d+.-]*:/i.test(string) && !/^https?:\/\//i.test(string) && !/^[^/:]+:\d+(\/|$)/.test(string)) return false;
    const urlToTest = string.startsWith('http://') || string.startsWith('https://')
      ? string
      : `http://${string}`;
    const url = new URL(urlToTest);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

router.get("/", async (req, res) => {
  try {
    const serverId = await resolveServer(req.query.server_id);
    const apps = await db.listApps(serverId);
    const normalizedApps = apps.map((app) => ({
      ...app,
      category: app.category ? app.category.toUpperCase() : app.category,
    }));
    res.json(normalizedApps);
  } catch (err) {
    console.error("Failed to load apps:", err);
    res.status(err.status || 500).json({ error: err.message || "Failed to load apps" });
  }
});

router.get("/categories", async (req, res) => {
  try {
    const categories = await db.getCategories(await resolveServer(req.query.server_id));
    const normalizedCategories = [...new Set(
      categories
        .filter((category) => typeof category === "string" && category.trim() !== "")
        .map((category) => category.toUpperCase())
    )];
    res.json(normalizedCategories);
  } catch (err) {
    console.error("Failed to load categories:", err);
    res.status(err.status || 500).json({ error: err.message || "Failed to load categories" });
  }
});

router.get("/export", async (req, res) => {
  try {
    const apps = await db.listApps();
    const payload = {
      schemaVersion: 2,
      servers: await db.listServers(),
      exportedAt: new Date().toISOString(),
      apps,
    };

    const zip = new AdmZip();
    zip.addFile("apps.json", Buffer.from(JSON.stringify(payload, null, 2), "utf8"));

    const exportedImages = new Set();
    for (const app of apps) {
      if (!app.image_url) continue;
      if (exportedImages.has(app.image_url)) continue;
      exportedImages.add(app.image_url);
      const filename = path.basename(app.image_url);
      if (!filename) continue;
      const filePath = path.join(uploadDir, filename);
      if (!fs.existsSync(filePath)) throw new Error(`Missing image: ${filename}`);
      zip.addLocalFile(filePath, "uploads");
    }

    const buffer = zip.toBuffer();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="homelinks-backup-${timestamp}.zip"`);
    res.send(buffer);
  } catch (err) {
    console.error("Failed to export backup:", err);
    res.status(500).json({ error: "Failed to export backup" });
  }
});

router.post("/import", uploadBackupZip, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Backup ZIP file is required" });
  }

  const createdImageUrls = [];
  try {
    let zip;
    try { zip = new AdmZip(req.file.path); } catch { throw toClientError("Invalid ZIP file"); }
    const entries = zip.getEntries();
    if (entries.reduce((sum, entry) => sum + entry.header.size, 0) > maxBackupBytes) {
      throw toClientError("Expanded backup must be <= 50MB");
    }
    const names = new Set();
    for (const entry of entries) {
      if (names.has(entry.entryName) || entry.entryName.includes("..") || entry.entryName.includes("\\") || entry.entryName.startsWith("/")) {
        throw toClientError("Invalid or duplicate ZIP path");
      }
      names.add(entry.entryName);
    }
    const appsEntry = entries.find(
      (entry) => !entry.isDirectory && path.posix.basename(entry.entryName.replace(/\\/g, "/")) === "apps.json"
    );

    if (!appsEntry) {
      throw toClientError("apps.json not found in ZIP");
    }

    let parsed;
    try {
      parsed = JSON.parse(zip.readAsText(appsEntry, "utf8"));
    } catch {
      throw toClientError("Invalid apps.json format");
    }

    const version = Array.isArray(parsed) ? 1 : parsed?.schemaVersion ?? 1;
    if (![1, 2].includes(version)) throw toClientError("Unsupported backup version");
    const rawApps = Array.isArray(parsed) ? parsed : parsed?.apps;
    if (!Array.isArray(rawApps)) {
      throw toClientError("apps.json must contain an apps array");
    }

    const servers = version === 1 ? [{ id: 1, name: "Home" }] : parsed.servers;
    if (!Array.isArray(servers) || !servers.length || servers.some((server) => !server || !Number.isSafeInteger(server.id) || server.id < 1 || typeof server.name !== "string" || !server.name.trim() || server.name.trim().length > 50) || new Set(servers.map((server) => server.id)).size !== servers.length) {
      throw toClientError("Invalid servers in backup");
    }
    const importedApps = rawApps.map((raw, index) => {
      const app = normalizeImportedApp(raw);
      app.server_id = version === 1 ? 1 : raw.server_id;
      app.favorite_order = version === 1 ? index : raw.favorite_order;
      if (!servers.some((server) => server.id === app.server_id) || !Number.isSafeInteger(app.favorite_order) || app.favorite_order < 0) {
        throw toClientError("Invalid app server or favorite order");
      }
      return app;
    });

    const uploadEntriesByName = new Map();
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const normalized = entry.entryName.replace(/\\/g, "/");
      if (!normalized.startsWith("uploads/")) continue;
      const fileName = path.posix.basename(normalized);
      if (!fileName || fileName === "." || fileName === "..") continue;
      if (uploadEntriesByName.has(fileName)) throw toClientError("Duplicate image filename");
      uploadEntriesByName.set(fileName, entry);
    }

    const fileMap = new Map();
    for (const app of importedApps) {
      if (!app.image_url) continue;
      const originalFileName = path.basename(app.image_url);
      if (fileMap.has(originalFileName)) continue;

      const zipEntry = uploadEntriesByName.get(originalFileName);
      if (!zipEntry) {
        throw toClientError(`Missing image in ZIP: ${originalFileName}`);
      }

      const ext = path.extname(originalFileName).toLowerCase();
      if (!allowedImageExtensions.includes(ext)) {
        throw toClientError(`Invalid image format for: ${originalFileName}`);
      }

      const fileData = zipEntry.getData();
      if (fileData.length > maxImageBytes) {
        throw toClientError(`Image exceeds ${maxImageBytes} bytes: ${originalFileName}`);
      }

      const uniqueName = `${randomUUID()}${ext}`;
      const destination = path.join(uploadDir, uniqueName);
      const newImageUrl = `/uploads/${uniqueName}`;
      createdImageUrls.push(newImageUrl);
      fs.writeFileSync(destination, fileData);

      const isValid = await validateImage(destination);
      if (!isValid) {
        throw toClientError(`Invalid image dimensions for: ${originalFileName}`);
      }

      fileMap.set(originalFileName, newImageUrl);
    }

    const finalApps = importedApps.map((app) => {
      if (!app.image_url) return app;
      const mapped = fileMap.get(path.basename(app.image_url));
      return {
        ...app,
        image_url: mapped || null,
      };
    });

    const previousApps = await db.listApps();
    await db.replaceAllApps(finalApps, servers.map((server) => ({ ...server, name: server.name.trim() })));
    createdImageUrls.length = 0;

    for (const app of previousApps) {
      if (app.image_url) {
        removeUpload(app.image_url);
      }
    }

    res.json({ ok: true, imported: finalApps.length });
  } catch (err) {
    for (const imageUrl of createdImageUrls) {
      removeUpload(imageUrl);
    }
    const status = err.status || 500;
    if (status === 500) {
      console.error("Failed to import backup:", err);
    }
    res.status(status).json({ error: err.message || "Failed to import backup" });
  } finally {
    if (req.file?.path) {
      fs.unlink(req.file.path, () => { });
    }
  }
});

async function resolveServer(value) {
  const servers = await db.listServers();
  const id = value === undefined ? servers[0].id : Number(value);
  if (!Number.isSafeInteger(id) || !servers.some((server) => server.id === id)) throw toClientError("Server not found");
  return id;
}

router.put("/favorites/order", async (req, res) => {
  try {
    await db.orderFavorites(await resolveServer(req.body?.server_id), req.body?.ids);
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

router.post("/", uploadImage, saveApp);
router.put("/:id", uploadImage, saveApp);
async function saveApp(req, res) {
  let createdImage = req.file ? `/uploads/${req.file.filename}` : null;
  try {
    const body = req.body || {};
    const app = normalizeImportedApp(body);
    const existing = req.params.id ? await db.getAppById(Number(req.params.id)) : null;
    if (req.params.id && !existing) return res.status(404).json({ error: "App not found" });
    const serverId = await resolveServer(body.server_id ?? existing?.server_id);
    if (req.file && !(await validateImage(req.file.path))) throw toClientError(`Image must be PNG, JPG or WebP, max ${maxImageSize} x ${maxImageSize}`);
    if (body.remove_image !== undefined && !["true", "false"].includes(body.remove_image)) throw toClientError("Invalid remove_image flag");
    if (req.file && body.remove_image === "true") throw toClientError("Cannot upload and remove an image together");
    if (!existing && !req.file && body.image_source_id && body.remove_image !== "true") {
      const source = await db.getAppById(Number(body.image_source_id));
      if (!source) throw toClientError("Source app no longer exists");
      if (source.image_url) {
        createdImage = `/uploads/${randomUUID()}${path.extname(source.image_url)}`;
        fs.copyFileSync(path.join(uploadDir, path.basename(source.image_url)), path.join(uploadDir, path.basename(createdImage)));
      }
    }
    const imageUrl = createdImage || (body.remove_image === "true" ? null : existing?.image_url || null);
    if (existing) {
      await db.updateApp(existing.id, app.name, app.url, imageUrl, app.category, app.description, serverId);
      createdImage = null;
      if (existing.image_url && existing.image_url !== imageUrl) await removeUnusedUpload(existing.image_url);
      res.json({ ok: true });
    } else {
      const id = await db.createApp(app.name, app.url, imageUrl, app.category, app.description, serverId);
      createdImage = null;
      res.status(201).json({ id });
    }
  } catch (err) {
    res.status(err.status || 500).json({ error: err.status ? err.message : "Failed to save app" });
  } finally {
    if (createdImage) removeUpload(createdImage);
  }
}

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "id is required" });
  }

  try {
    const existing = await db.getAppById(id);
    const result = await db.deleteApp(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "app not found" });
    }
    if (existing && existing.image_url) {
      await removeUnusedUpload(existing.image_url);
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete app" });
  }
});

router.patch("/:id/favorite", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "id is required" });
  }

  try {
    const result = await db.toggleFavorite(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: "app not found" });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to toggle favorite" });
  }
});

module.exports = router;
