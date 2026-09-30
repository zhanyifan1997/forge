import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildDeployConfig } from "../scripts/cloudflare.mjs";

const local = JSON.parse(readFileSync(new URL("../wrangler.local.jsonc", import.meta.url), "utf8"));
const env = {
  D1_DATABASE_ID: "123e4567-e89b-12d3-a456-426614174000",
  D1_DATABASE_NAME: "neuralperch-prod",
  R2_BUCKET_NAME: "neuralperch-prod-media",
  ACCESS_TEAM_DOMAIN: "my-team.cloudflareaccess.com",
  ACCESS_AUD: "test-audience",
  SITE_DOMAIN: "neuralperch.com",
  WORKER_NAME: "neuralperch-prod"
};

test("deploy config receives all Cloudflare resource values from environment", () => {
  const config = buildDeployConfig(local, env);
  assert.equal(config.name, "neuralperch-prod");
  assert.equal(config.d1_databases[0].database_id, env.D1_DATABASE_ID);
  assert.equal(config.d1_databases[0].database_name, env.D1_DATABASE_NAME);
  assert.equal(config.r2_buckets[0].bucket_name, env.R2_BUCKET_NAME);
  assert.deepEqual(config.vars, { ACCESS_TEAM_DOMAIN: env.ACCESS_TEAM_DOMAIN, ACCESS_AUD: env.ACCESS_AUD });
  assert.deepEqual(config.routes, [{ pattern: env.SITE_DOMAIN, custom_domain: true }]);
  assert.equal(config.workers_dev, false);
  assert.equal(local.d1_databases[0].database_id, "00000000-0000-0000-0000-000000000000");
});

test("missing resource variables fail before deployment", () => {
  assert.throws(() => buildDeployConfig(local, { ...env, D1_DATABASE_ID: "" }), /D1_DATABASE_ID/);
  assert.throws(() => buildDeployConfig(local, { ...env, ACCESS_AUD: "" }), /ACCESS_AUD/);
  assert.throws(() => buildDeployConfig(local, { ...env, SITE_DOMAIN: "" }), /SITE_DOMAIN/);
});
