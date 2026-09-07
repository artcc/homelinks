const express = require("express");
const db = require("../db");
const router = express.Router();

router.get("/", async (req, res, next) => {
  try { res.json(await db.listServers()); } catch (err) { next(err); }
});

router.post("/", save);
router.put("/:id", save);
async function save(req, res, next) {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 50) return res.status(400).json({ error: "Server name must contain 1 to 50 characters" });
  try {
    const result = req.params.id ? await db.renameServer(Number(req.params.id), name) : await db.createServer(name);
    if (!result.changes) return res.status(404).json({ error: "Server not found" });
    res.status(req.params.id ? 200 : 201).json({ id: result.id, ok: true });
  } catch (err) { next(err); }
}

router.delete("/:id", async (req, res, next) => {
  try {
    const result = await db.deleteServer(Number(req.params.id));
    if (!result.changes) return res.status(409).json({ error: "Server must exist, be empty, and not be the last server" });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
