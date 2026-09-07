const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const net = require("node:net");
const sqlite3 = require("sqlite3");
const sharp = require("sharp");
const AdmZip = require("adm-zip");

test("migration, server isolation, image lifecycle, backups and restart", { timeout: 120000 }, async (t) => {
  const dir = await fs.mkdtemp(path.join(__dirname, "..", "node_modules", ".homelinks-test-"));
  const dbPath = path.join(dir, "old.sqlite");
  const uploads = path.join(dir, "uploads");
  await fs.mkdir(uploads);
  const old = new sqlite3.Database(dbPath);
  await new Promise((resolve, reject) => old.exec("CREATE TABLE apps (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP); INSERT INTO apps (name, url) VALUES ('Legacy', 'http://legacy.local');", (err) => err ? reject(err) : resolve()));
  await new Promise((resolve) => old.close(resolve));
  const socket = net.createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child;
  let cookie;
  let output = "";
  async function start() {
    child = spawn(process.execPath, ["src/server.js"], {
      env: { ...process.env, TMPDIR: dir, PORT: String(port), DB_PATH: dbPath, UPLOAD_DIR: uploads, MAX_IMAGE_SIZE: "64", MAX_IMAGE_BYTES: "4096", ADMIN_EMAIL: "test@example.com", ADMIN_PASSWORD: "test-password", SESSION_SECRET: "integration-secret", COOKIE_SECURE: "false", TRUST_PROXY: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (data) => { output += data; });
    child.stderr.on("data", (data) => { output += data; });
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(output);
      try { if ((await fetch(`${base}/health`)).ok) return; } catch { /* Wait for listener. */ }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Startup timeout: ${output}`);
  }
  async function stop() {
    if (child && child.exitCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
  }
  t.after(async () => { await stop(); await fs.rm(dir, { recursive: true, force: true }); });
  async function request(url, method = "GET", body, expected = 200) {
    const headers = cookie ? { Cookie: cookie } : {};
    if (body && !(body instanceof FormData)) { headers["Content-Type"] = "application/json"; body = JSON.stringify(body); }
    const response = await fetch(base + url, { method, headers, body });
    assert.equal(response.status, expected, `${method} ${url}: ${await response.clone().text()}`);
    return response;
  }
  async function login() {
    const response = await request("/api/login", "POST", { email: "test@example.com", password: "test-password" });
    cookie = response.headers.get("set-cookie").split(";")[0];
  }
  async function apps(server = 1) { return (await request(`/api/apps?server_id=${server}`)).json(); }
  function form(fields, image) {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, String(value));
    if (image) data.append("image", new Blob([image], { type: "image/png" }), "test.png");
    return data;
  }
  async function importZip(payload, images = {}, expected = 200) {
    const zip = new AdmZip();
    zip.addFile("apps.json", Buffer.from(JSON.stringify(payload)));
    for (const [name, data] of Object.entries(images)) zip.addFile(`uploads/${name}`, data);
    const data = new FormData();
    data.append("backup", new Blob([zip.toBuffer()], { type: "application/zip" }), "backup.zip");
    return request("/api/apps/import", "POST", data, expected);
  }
  await start();
  await request("/api/servers", "GET", undefined, 401);
  await login();
  assert.deepEqual(await (await request("/api/config")).json(), { maxImageBytes: 4096, maxImageSize: 64 });
  assert.equal((await apps())[0].server_id, 1);
  assert.equal((await apps())[0].name, "Legacy");
  assert.match(await (await request("/vendor/lucide.js")).text(), /lucide/i);
  const server = (await (await request("/api/servers", "POST", { name: "NAS" }, 201)).json()).id;
  await request(`/api/servers/${server}`, "PUT", { name: "Lab" });
  await request("/api/servers", "POST", { name: " " }, 400);
  assert.deepEqual(await apps(server), []);
  const image = await sharp({ create: { width: 16, height: 16, channels: 3, background: "red" } }).png().toBuffer();
  const fields = { name: "Media", url: "http://media.local", category: "media", server_id: server };
  const id = (await (await request("/api/apps", "POST", form(fields, image), 201)).json()).id;
  const original = (await apps(server))[0];
  await request(`/api/servers/${server}`, "DELETE", undefined, 409);
  assert.deepEqual(await (await request(`/api/apps/categories?server_id=${server}`)).json(), ["MEDIA"]);
  assert.deepEqual(await (await request("/api/apps/categories?server_id=1")).json(), []);
  await request("/api/apps?server_id=9999", "GET", undefined, 400);
  await request("/api/apps", "POST", form({ ...fields, server_id: 9999 }, image), 400);
  const oversized = await sharp({ create: { width: 65, height: 16, channels: 3, background: "red" } }).png().toBuffer();
  await request("/api/apps", "POST", form(fields, oversized), 400);
  await request("/api/apps", "POST", form(fields, Buffer.alloc(4097)), 400);
  await request("/api/apps", "POST", form({ ...fields, name: " " }, image), 400);
  assert.equal((await fs.readdir(uploads)).length, 1);
  const copyId = (await (await request("/api/apps", "POST", form({ ...fields, image_source_id: id }), 201)).json()).id;
  const copy = (await apps(server)).find((app) => app.id === copyId);
  assert.notEqual(copy.image_url, original.image_url);
  assert.deepEqual(await fs.readFile(path.join(uploads, path.basename(copy.image_url))), image);
  await request(`/api/apps/${id}`, "PUT", form({ ...fields, remove_image: true }));
  assert.equal((await apps(server)).find((app) => app.id === id).image_url, null);
  await assert.rejects(fs.access(path.join(uploads, path.basename(original.image_url))));
  await fs.access(path.join(uploads, path.basename(copy.image_url)));
  await request(`/api/apps/${copyId}`, "PUT", form({ ...fields, name: "Copied", server_id: 1 }));
  assert.equal((await apps(1)).find((app) => app.id === copyId).image_url, copy.image_url);
  await request(`/api/apps/${id}/favorite`, "PATCH");
  const second = (await (await request("/api/apps", "POST", form({ ...fields, name: "Second" }), 201)).json()).id;
  await request(`/api/apps/${second}/favorite`, "PATCH");
  await request("/api/apps/favorites/order", "PUT", { server_id: server, ids: [second, id] });
  assert.deepEqual((await apps(server)).map((app) => app.id), [second, id]);
  await request("/api/apps/favorites/order", "PUT", { server_id: server, ids: [copyId, id] }, 400);
  await request("/api/apps/favorites/order", "PUT", { server_id: server, ids: [id, id] }, 400);
  const backup = new AdmZip(Buffer.from(await (await request("/api/apps/export")).arrayBuffer()));
  const payload = JSON.parse(backup.readAsText("apps.json"));
  assert.equal(payload.schemaVersion, 2);
  assert.equal(payload.servers.length, 2);
  const before = await apps(server);
  await importZip({ ...payload, apps: [{ ...payload.apps[0], server_id: 99999 }] }, {}, 400);
  await importZip({ schemaVersion: 99, apps: [] }, {}, 400);
  await importZip({ ...payload, servers: [payload.servers[0], payload.servers[0]] }, {}, 400);
  await importZip({ apps: [{ name: "Missing", url: "https://example.com", image_url: "/uploads/missing.png" }] }, {}, 400);
  await importZip({ apps: [{ name: "Invalid image", url: "https://example.com", image_url: "/uploads/large.png" }] }, { "large.png": oversized }, 400);
  assert.equal((await fs.readdir(uploads)).length, 1);
  assert.deepEqual(await apps(server), before);
  await fs.access(path.join(uploads, path.basename(copy.image_url)));
  const images = {};
  for (const entry of backup.getEntries()) if (entry.entryName.startsWith("uploads/")) images[path.basename(entry.entryName)] = entry.getData();
  await importZip(payload, images);
  assert.deepEqual((await apps(server)).map((app) => app.name), ["Second", "Media"]);
  await stop();
  await start();
  await request("/api/apps", "GET", undefined, 401);
  await login();
  assert.deepEqual((await apps(server)).map((app) => app.name), ["Second", "Media"]);
  assert.equal((await (await request("/api/servers")).json())[1].name, "Lab");
  const oldPayload = { schemaVersion: 1, apps: [{ name: "Old backup", url: "http://old.local", favorite: 1, category: "old", image_url: "/uploads/old.png" }, { name: "Old sibling", url: "http://sibling.local", image_url: "/uploads/old.png" }] };
  await importZip(oldPayload, { "old.png": image });
  assert.equal((await apps())[0].name, "Old backup");
  assert.equal((await apps())[0].server_id, 1);
  assert.equal((await (await request("/api/servers")).json()).length, 1);
  assert.equal((await fs.readdir(uploads)).length, 1);
  const sharedApps = await apps();
  const sharedExport = new AdmZip(Buffer.from(await (await request("/api/apps/export")).arrayBuffer()));
  assert.equal(sharedExport.getEntries().filter((entry) => entry.entryName.startsWith("uploads/")).length, 1);
  await request(`/api/apps/${sharedApps[1].id}`, "DELETE");
  await fs.access(path.join(uploads, path.basename(sharedApps[0].image_url)));
  await request(`/api/apps/${sharedApps[0].id}`, "PUT", form({ name: "Old backup", url: "http://old.local" }, image));
  await assert.rejects(fs.access(path.join(uploads, path.basename(sharedApps[0].image_url))));
  assert.equal((await fs.readdir(uploads)).length, 1);
  await importZip([{ name: "Array backup", url: "http://array.local" }]);
  assert.equal((await fs.readdir(uploads)).length, 0);
  const emptyServer = (await (await request("/api/servers", "POST", { name: "Empty" }, 201)).json()).id;
  await request(`/api/servers/${emptyServer}`, "DELETE");
  await request("/api/servers/1", "DELETE", undefined, 409);
  await stop();
  await start();
  await login();
  assert.equal((await apps())[0].name, "Array backup");
  if (process.env.UI_TEST) {
    process.env.TMPDIR = dir;
    await require("./browser")(base, image);
  }
});
