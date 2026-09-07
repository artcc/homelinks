const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const sqlite3 = require("sqlite3");

test("rich legacy database preserves fields and IDs across repeated migrations", async (t) => {
  const dir = await fs.mkdtemp(path.join(__dirname, "..", "node_modules", ".homelinks-migration-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const dbPath = path.join(dir, "legacy.sqlite");
  const old = new sqlite3.Database(dbPath);
  await new Promise((resolve, reject) => old.exec(`
    CREATE TABLE apps (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL,
      created_at TEXT, image_url TEXT, favorite INTEGER DEFAULT 0, category TEXT, description TEXT);
    INSERT INTO apps VALUES (42, 'NAS', 'http://nas.local', '2026-01-01', '/uploads/keep.png', 1, ' media ', 'Keep notes');
  `, (err) => err ? reject(err) : resolve()));
  await new Promise((resolve) => old.close(resolve));
  const script = "const db = require('./src/db'); (async () => { console.log(JSON.stringify({ apps: await db.listApps(), servers: await db.listServers() })); await db.close(); })().catch(err => { console.error(err); process.exit(1); });";
  const options = { env: { ...process.env, DB_PATH: dbPath } };
  const first = JSON.parse((await promisify(execFile)(process.execPath, ["-e", script], options)).stdout);
  assert.deepEqual(first.servers, [{ id: 1, name: "Home" }]);
  assert.deepEqual(first.apps, [{ id: 42, name: "NAS", url: "http://nas.local", created_at: "2026-01-01", image_url: "/uploads/keep.png", favorite: 1, category: "MEDIA", description: "Keep notes", server_id: 1, favorite_order: 0 }]);
  const second = JSON.parse((await promisify(execFile)(process.execPath, ["-e", script], options)).stdout);
  assert.deepEqual(second, first);
  const rollbackScript = `const db = require('./src/db'); (async () => {
    let rejected = false;
    try { await db.replaceAllApps(${JSON.stringify([{ ...first.apps[0], server_id: 999 }])}, [{ id: 2, name: 'Replacement' }]); }
    catch { rejected = true; }
    console.log(JSON.stringify({ rejected, apps: await db.listApps(), servers: await db.listServers() }));
    await db.close();
  })().catch(err => { console.error(err); process.exit(1); });`;
  const rollback = JSON.parse((await promisify(execFile)(process.execPath, ["-e", rollbackScript], options)).stdout);
  assert.equal(rollback.rejected, true);
  assert.deepEqual(rollback.apps, first.apps);
  assert.deepEqual(rollback.servers, first.servers);
});
