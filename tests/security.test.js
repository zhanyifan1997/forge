import test from "node:test";
import assert from "node:assert/strict";
import { checkAdminCredentials, checkAdminToken, checkPassword, checkUnlockToken, createAdminToken, createPasswordRecord, createUnlockToken } from "../src/security.js";
import worker from "../src/worker.js";

const secret = "local-test-secret-with-more-than-thirty-two-characters";
const admin = { ADMIN_USERNAME: "owner", ADMIN_PASSWORD: "a-strong-admin-password", SESSION_SECRET: secret };

function loginDatabase() {
  const attempts = new Map();
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() {
              if (sql.includes("FROM unlock_attempts")) return attempts.get(values[0]) || null;
              return null;
            },
            async run() {
              if (sql.startsWith("INSERT INTO unlock_attempts")) attempts.set(values[0], { attempts: values[1], first_at: values[2] });
              if (sql.startsWith("DELETE FROM unlock_attempts")) attempts.delete(values[0]);
            }
          };
        }
      };
    }
  };
}

test("password record verifies only the correct password", async () => {
  const record = await createPasswordRecord(secret, "example-password-123");
  assert.equal(await checkPassword(secret, record, "example-password-123"), true);
  assert.equal(await checkPassword(secret, record, "wrong-password"), false);
  assert.equal(JSON.stringify(record).includes("example-password-123"), false);
});

test("unlock token is bound to the current password revision", async () => {
  const first = await createPasswordRecord(secret, "example-password-123");
  const second = await createPasswordRecord(secret, "example-password-456");
  const token = await createUnlockToken(secret, first.revision);
  assert.equal(await checkUnlockToken(secret, token, first.revision), true);
  assert.equal(await checkUnlockToken(secret, token, second.revision), false);
  assert.equal(await checkUnlockToken(secret, token + "x", first.revision), false);
});

test("admin credentials and signed session reject wrong passwords and rotation", async () => {
  assert.equal(await checkAdminCredentials(admin, "owner", "a-strong-admin-password"), true);
  assert.equal(await checkAdminCredentials(admin, "owner", "wrong-password"), false);
  const token = await createAdminToken(admin);
  assert.equal(await checkAdminToken(admin, token), true);
  assert.equal(await checkAdminToken({ ...admin, ADMIN_PASSWORD: "another-strong-password" }, token), false);
  assert.equal(await checkAdminToken(admin, token + "x"), false);
});

test("admin API does not return data without a session", async () => {
  const response = await worker.fetch(new Request("https://neuralperch.com/api/admin/bootstrap"), { ...admin, DB: {} });
  assert.equal(response.status, 401);
});

test("admin page serves the login app without a session", async () => {
  let assetPath;
  const env = { ASSETS: { fetch: async request => {
    assetPath = new URL(request.url).pathname;
    return new Response("admin");
  } } };
  const response = await worker.fetch(new Request("https://neuralperch.com/admin/"), env);
  assert.equal(response.status, 200);
  assert.equal(assetPath, "/admin/");
});

test("login sets a session cookie and rejects repeated wrong passwords", async () => {
  const env = { ...admin, DB: loginDatabase() };
  const request = (password) => new Request("https://neuralperch.com/api/admin/login", {
    method: "POST", headers: { "content-type": "application/json", "CF-Connecting-IP": "203.0.113.7" },
    body: JSON.stringify({ username: "owner", password })
  });
  const success = await worker.fetch(request(admin.ADMIN_PASSWORD), env);
  assert.equal(success.status, 200);
  const cookie = success.headers.get("set-cookie");
  assert.match(cookie, /np_admin=/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  const authenticated = await worker.fetch(new Request("https://neuralperch.com/api/admin/bootstrap", {
    headers: { cookie: cookie.split(";")[0] }
  }), env);
  assert.equal(authenticated.status, 200);
  for (let i = 0; i < 5; i++) assert.equal((await worker.fetch(request("wrong"), env)).status, 401);
  assert.equal((await worker.fetch(request("wrong"), env)).status, 429);
});

test("protected content does not return without an unlock cookie", async () => {
  const env = {
    DB: { prepare: () => ({ bind: () => ({ first: async () => ({ value: JSON.stringify({ revision: "current" }) }) }) }) },
    SESSION_SECRET: secret
  };
  const response = await worker.fetch(new Request("https://neuralperch.com/api/public/entries/project"), env);
  assert.equal(response.status, 403);
});

test("private R2 media does not return without an unlock cookie", async () => {
  let mediaCalled = false;
  const env = {
    DB: { prepare: () => ({ bind: () => ({ first: async () => ({ value: JSON.stringify({ revision: "current" }) }) }) }) },
    SESSION_SECRET: secret,
    MEDIA: { get: async () => { mediaCalled = true; return null; } }
  };
  const response = await worker.fetch(new Request("https://neuralperch.com/media/private/123e4567-e89b-12d3-a456-426614174000.jpg"), env);
  assert.equal(response.status, 403);
  assert.equal(mediaCalled, false);
});

test("site social links are saved and unsafe URLs are rejected", async () => {
  let saved;
  const env = {
    ...admin,
    DB: { prepare: () => ({ bind: (...values) => ({ run: async () => { saved = JSON.parse(values[1]); } }) }) }
  };
  const token = await createAdminToken(env);
  const save = socialLinks => worker.fetch(new Request("https://neuralperch.com/api/admin/site", {
    method: "PUT",
    headers: { cookie: `np_admin=${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: "Neuralperch", socialLinks })
  }), env);
  const valid = [{ platform: "youtube", label: "视频", url: "https://youtube.com/@example" }];
  assert.equal((await save(valid)).status, 200);
  assert.deepEqual(saved.socialLinks, valid);
  assert.equal((await save([{ platform: "website", label: "危险链接", url: "javascript:alert(1)" }])).status, 400);
});
