import test from "node:test";
import assert from "node:assert/strict";
import { checkPassword, checkUnlockToken, createPasswordRecord, createUnlockToken, verifyAccess } from "../src/security.js";
import worker from "../src/worker.js";

const secret = "local-test-secret-with-more-than-thirty-two-characters";

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

test("local admin bypass cannot authorize a remote hostname", async () => {
  const env = { DEV_ADMIN_BYPASS: "true" };
  assert.equal(await verifyAccess(new Request("http://localhost:8787/api/admin/bootstrap"), env), true);
  assert.equal(await verifyAccess(new Request("https://neuralperch.com/api/admin/bootstrap"), env), false);
});

test("admin API does not return data without Access identity", async () => {
  const response = await worker.fetch(new Request("https://neuralperch.com/api/admin/bootstrap"), { DB: {}, ASSETS: {} });
  assert.equal(response.status, 401);
});

test("admin page does not serve static files without Access identity", async () => {
  let assetsCalled = false;
  const env = { ASSETS: { fetch: async () => { assetsCalled = true; return new Response("admin"); } } };
  const response = await worker.fetch(new Request("https://neuralperch.com/admin/"), env);
  assert.equal(response.status, 401);
  assert.equal(assetsCalled, false);
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
