import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const localConfigPath = join(root, "wrangler.local.jsonc");
const generatedConfigPath = join(root, ".wrangler.generated.jsonc");
const wrangler = join(root, "node_modules", ".bin", "wrangler");

function required(env, key) {
  const value = String(env[key] || "").trim();
  if (!value) throw new Error(`缺少部署环境变量 ${key}`);
  return value;
}

export function buildDeployConfig(local, env) {
  const databaseId = required(env, "D1_DATABASE_ID");
  const databaseName = required(env, "D1_DATABASE_NAME");
  const bucketName = required(env, "R2_BUCKET_NAME");
  const siteDomain = required(env, "SITE_DOMAIN");
  const workerName = String(env.WORKER_NAME || "neuralperch").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId)) throw new Error("D1_DATABASE_ID 必须是 UUID");
  if (!/^[a-z][a-z0-9-]{1,61}[a-z0-9]$/.test(workerName)) throw new Error("WORKER_NAME 格式无效");
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucketName)) throw new Error("R2_BUCKET_NAME 格式无效");
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(databaseName)) throw new Error("D1_DATABASE_NAME 格式无效");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(siteDomain)) throw new Error("SITE_DOMAIN 格式无效");
  const config = structuredClone(local);
  config.name = workerName;
  config.d1_databases = [{ ...local.d1_databases[0], database_name: databaseName, database_id: databaseId }];
  config.r2_buckets = [{ ...local.r2_buckets[0], bucket_name: bucketName }];
  config.routes = [{ pattern: siteDomain, custom_domain: true }];
  config.workers_dev = false;
  return config;
}

function runWrangler(args) {
  const result = spawnSync(wrangler, args, { cwd: root, stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Wrangler 退出码：${result.status ?? "未知"}`);
}

function main() {
  const action = process.argv[2];
  if (!["check", "migrate", "deploy"].includes(action)) {
    throw new Error("用法：node scripts/cloudflare.mjs check|migrate|deploy");
  }
  const local = JSON.parse(readFileSync(localConfigPath, "utf8"));
  const config = buildDeployConfig(local, process.env);
  let adminSecrets;
  if (action !== "migrate") {
    adminSecrets = {
      ADMIN_USERNAME: required(process.env, "ADMIN_USERNAME"),
      ADMIN_PASSWORD: required(process.env, "ADMIN_PASSWORD"),
      SESSION_SECRET: required(process.env, "SESSION_SECRET")
    };
    if (adminSecrets.ADMIN_PASSWORD.length < 12) throw new Error("ADMIN_PASSWORD 至少需要 12 个字符");
    if (adminSecrets.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET 至少需要 32 个字符");
  }
  let secretDir;
  try {
    writeFileSync(generatedConfigPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    if (action === "check") {
      runWrangler(["deploy", "--dry-run", "--config", generatedConfigPath]);
    } else if (action === "migrate") {
      runWrangler(["d1", "migrations", "apply", config.d1_databases[0].database_name, "--remote", "--config", generatedConfigPath]);
    } else {
      secretDir = mkdtempSync(join(tmpdir(), "neuralperch-secrets-"));
      const secretPath = join(secretDir, "secrets.json");
      writeFileSync(secretPath, JSON.stringify(adminSecrets), { mode: 0o600 });
      runWrangler(["deploy", "--config", generatedConfigPath, "--secrets-file", secretPath]);
    }
  } finally {
    rmSync(generatedConfigPath, { force: true });
    if (secretDir) rmSync(secretDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
