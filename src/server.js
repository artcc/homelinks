const express = require("express");
const fs = require("fs");
const morgan = require("morgan");
const path = require("path");
const session = require("express-session");
const {
  adminEmail,
  adminPassword,
  baseDir,
  cookieSecure,
  port,
  sessionSecret,
  trustProxy,
  uploadDir,
  maxImageBytes,
  maxImageSize,
} = require("./config/env");
const { requireAuthApi, requireAuthPage, isAuthenticated } = require("./middleware/auth");
const appsRoutes = require("./routes/apps");
const authRoutes = require("./routes/auth");
const healthRoutes = require("./routes/health");
const pagesRoutes = require("./routes/pages");

if (!adminEmail || !adminPassword || sessionSecret === "change-me") {
  console.error(
    "Auth is required. Set ADMIN_EMAIL, ADMIN_PASSWORD, and SESSION_SECRET."
  );
  process.exit(1);
}

fs.mkdirSync(uploadDir, { recursive: true });

const app = express();
const publicDir = path.join(baseDir, "public");

if (trustProxy) {
  app.set("trust proxy", 1);
}

app.use(express.json());
app.use(morgan("combined"));
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: cookieSecure,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    },
  })
);

app.use("/uploads", requireAuthPage, express.static(uploadDir));
app.use((req, res, next) => {
  if ((req.path === "/" || req.path === "/index.html") && !isAuthenticated(req)) {
    return res.redirect("/login.html");
  }
  return next();
});
app.use(express.static(publicDir));
app.get("/vendor/lucide.js", (req, res) => {
  res.sendFile(require.resolve("lucide/dist/umd/lucide.min.js"));
});

app.use(healthRoutes);
app.use(authRoutes);
app.use(pagesRoutes);
app.get("/api/config", requireAuthApi, (req, res) => res.json({ maxImageBytes, maxImageSize }));
// Keep multi-step database/filesystem operations isolated on the shared SQLite connection.
let pending = Promise.resolve();
app.use(["/api/apps", "/api/servers"], requireAuthApi, (req, res, next) => {
  const previous = pending;
  pending = new Promise((resolve) => {
    previous.then(() => {
      if (res.destroyed) return resolve();
      req.once("aborted", () => {
        if (!req.complete) resolve();
      });
      const end = res.end;
      res.end = function (...args) {
        try { return end.apply(this, args); } finally { resolve(); }
      };
      next();
    });
  });
});
app.use("/api/apps", appsRoutes);
app.use("/api/servers", require("./routes/servers"));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Unexpected server error" });
});

app.listen(port, () => {
  console.log(`homelinks running on port ${port}`);
});

// Manejo de cierre graceful
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, closing gracefully...");
  const dbModule = require("./db");
  await dbModule.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, closing gracefully...");
  const dbModule = require("./db");
  await dbModule.close();
  process.exit(0);
});
