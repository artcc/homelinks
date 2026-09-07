const fs = require("fs");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();
const { baseDir } = require("./config/env");

const defaultDbPath = path.join(baseDir, "data", "homelinks.sqlite");
const dbPath = process.env.DB_PATH || defaultDbPath;

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new sqlite3.Database(dbPath);

const initialization = new Promise((resolve, reject) => {
  db.serialize(() => {
    db.run(
      "CREATE TABLE IF NOT EXISTS apps (" +
      "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
      "name TEXT NOT NULL, " +
      "url TEXT NOT NULL, " +
      "created_at TEXT DEFAULT CURRENT_TIMESTAMP" +
      ")",
      (createError) => {
        if (createError) return reject(createError);

        db.all("PRAGMA table_info(apps)", (infoError, rows) => {
          if (infoError) return reject(infoError);

          const columns = [
            ["image_url", "ALTER TABLE apps ADD COLUMN image_url TEXT"],
            ["favorite", "ALTER TABLE apps ADD COLUMN favorite INTEGER DEFAULT 0"],
            ["category", "ALTER TABLE apps ADD COLUMN category TEXT"],
            ["description", "ALTER TABLE apps ADD COLUMN description TEXT"],
            ["server_id", "ALTER TABLE apps ADD COLUMN server_id INTEGER NOT NULL DEFAULT 1 REFERENCES servers(id)"],
            ["favorite_order", "ALTER TABLE apps ADD COLUMN favorite_order INTEGER NOT NULL DEFAULT 0"],
          ];
          const migrations = [
            "CREATE TABLE IF NOT EXISTS servers (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL)",
            "INSERT INTO servers (id, name) SELECT 1, 'Home' WHERE NOT EXISTS (SELECT 1 FROM servers)",
            ...columns
              .filter(([name]) => !rows.some((row) => row.name === name))
              .map(([, sql]) => sql),
            "PRAGMA foreign_keys = ON",
          ];

          const applyMigration = (index) => {
            if (index >= migrations.length) {
              return db.run(
                "UPDATE apps SET category = UPPER(TRIM(category)) WHERE category IS NOT NULL AND category != ''",
                (updateError) => {
                  if (updateError) return reject(updateError);
                  resolve();
                }
              );
            }
            return db.run(migrations[index], (migrationError) => {
              if (migrationError) return reject(migrationError);
              applyMigration(index + 1);
            });
          };

          applyMigration(0);
        });
      }
    );
  });
});

async function run(sql, params = []) {
  await initialization;
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

async function all(sql, params = []) {
  await initialization;
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

module.exports = {
  async listApps(serverId = null) {
    return all(
      "SELECT * FROM apps" + (serverId === null ? "" : " WHERE server_id = ?") + " ORDER BY favorite DESC, CASE WHEN favorite THEN favorite_order ELSE 0 END ASC, name COLLATE NOCASE ASC, id ASC",
      serverId === null ? [] : [serverId]
    );
  },
  async getAppById(id) {
    const rows = await all(
      "SELECT * FROM apps WHERE id = ?",
      [id]
    );
    return rows[0] || null;
  },
  async createApp(name, url, imageUrl = null, category = null, description = null, serverId = 1) {
    const result = await run(
      "INSERT INTO apps (name, url, image_url, favorite, category, description, server_id) VALUES (?, ?, ?, 0, ?, ?, ?)",
      [name, url, imageUrl, category, description, serverId]
    );
    return result.id;
  },
  async updateApp(id, name, url, imageUrl, category, description, serverId) {
    return run(
      "UPDATE apps SET name = ?, url = ?, image_url = ?, category = ?, description = ?, favorite_order = CASE WHEN server_id != ? THEN (SELECT COALESCE(MAX(favorite_order), 0) + 1 FROM apps WHERE server_id = ?) ELSE favorite_order END, server_id = ? WHERE id = ?",
      [name, url, imageUrl, category, description, serverId, serverId, serverId, id]
    );
  },
  async toggleFavorite(id) {
    return run(
      "UPDATE apps SET favorite = NOT favorite, favorite_order = (SELECT COALESCE(MAX(favorite_order), 0) + 1 FROM apps WHERE server_id = (SELECT server_id FROM apps WHERE id = ?)) WHERE id = ?",
      [id, id]
    );
  },
  async replaceAllApps(apps, servers) {
    await run("BEGIN TRANSACTION");
    try {
      await run("DELETE FROM apps");
      await run("DELETE FROM servers");
      for (const server of servers) {
        await run("INSERT INTO servers (id, name) VALUES (?, ?)", [server.id, server.name]);
      }
      for (const app of apps) {
        await run(
          "INSERT INTO apps (name, url, image_url, favorite, category, description, created_at, server_id, favorite_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [
            app.name,
            app.url,
            app.image_url || null,
            app.favorite ? 1 : 0,
            app.category || null,
            app.description || null,
            app.created_at || new Date().toISOString(),
            app.server_id,
            app.favorite_order,
          ]
        );
      }
      await run("COMMIT");
    } catch (err) {
      await run("ROLLBACK");
      throw err;
    }
  },
  async getCategories(serverId) {
    const rows = await all(
      "SELECT DISTINCT category FROM apps WHERE server_id = ? AND category IS NOT NULL AND category != '' ORDER BY UPPER(category) ASC", [serverId]
    );
    // Deduplicate case-insensitive (e.g. 'Media' and 'media')
    const seen = new Map();
    for (const row of rows) {
      const key = row.category.toLowerCase();
      if (!seen.has(key)) seen.set(key, row.category);
    }
    return Array.from(seen.values());
  },
  async deleteApp(id) {
    return run("DELETE FROM apps WHERE id = ?", [id]);
  },
  listServers() {
    return all("SELECT * FROM servers ORDER BY id");
  },
  createServer(name) {
    return run("INSERT INTO servers (name) VALUES (?)", [name]);
  },
  renameServer(id, name) {
    return run("UPDATE servers SET name = ? WHERE id = ?", [name, id]);
  },
  deleteServer(id) {
    return run("DELETE FROM servers WHERE id = ? AND NOT EXISTS (SELECT 1 FROM apps WHERE server_id = ?) AND (SELECT COUNT(*) FROM servers) > 1", [id, id]);
  },
  async orderFavorites(serverId, ids) {
    const favorites = (await this.listApps(serverId)).filter((app) => app.favorite);
    if (!Array.isArray(ids) || ids.length !== favorites.length || new Set(ids).size !== ids.length || ids.some((id) => !favorites.some((app) => app.id === id))) {
      const err = new Error("Order must contain every favorite in this server exactly once");
      err.status = 400;
      throw err;
    }
    await run("BEGIN TRANSACTION");
    try {
      for (const [index, id] of ids.entries()) {
        await run("UPDATE apps SET favorite_order = ? WHERE id = ?", [index, id]);
      }
      await run("COMMIT");
    } catch (err) {
      await run("ROLLBACK");
      throw err;
    }
  },
  close() {
    return initialization.then(() => new Promise((resolve) => {
      db.close((err) => {
        if (err) console.error("Error closing database:", err);
        resolve();
      });
    }));
  },
};
