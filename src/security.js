const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function b64url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

export function fromB64url(input) {
  const padded = input.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - input.length % 4) % 4);
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
}

export async function hmac(secret, value) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createPasswordRecord(secret, password) {
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters");
  if (password.length < 8) throw new Error("访问密码至少需要 8 个字符");
  const salt = b64url(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, digest: await hmac(secret, `password:${salt}:${password}`), revision: crypto.randomUUID() };
}

export async function checkPassword(secret, record, password) {
  if (!record?.salt || !record?.digest || !secret) return false;
  return safeEqual(await hmac(secret, `password:${record.salt}:${password}`), record.digest);
}

export async function createUnlockToken(secret, revision) {
  const payload = b64url(encoder.encode(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400, revision })));
  return `${payload}.${await hmac(secret, `unlock:${payload}`)}`;
}

export async function checkUnlockToken(secret, token, revision) {
  if (!secret || !token || !revision) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !safeEqual(await hmac(secret, `unlock:${payload}`), signature)) return false;
  try {
    const data = JSON.parse(decoder.decode(fromB64url(payload)));
    return data.revision === revision && Number.isFinite(data.exp) && data.exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function adminConfigured(env) {
  return typeof env.ADMIN_USERNAME === "string" && env.ADMIN_USERNAME.trim().length > 0 &&
    typeof env.ADMIN_PASSWORD === "string" && env.ADMIN_PASSWORD.length >= 12 &&
    typeof env.SESSION_SECRET === "string" && env.SESSION_SECRET.length >= 32;
}

async function adminRevision(env) {
  return hmac(env.SESSION_SECRET, `admin:${env.ADMIN_USERNAME.trim()}\0${env.ADMIN_PASSWORD}`);
}

export async function checkAdminCredentials(env, username, password) {
  if (!adminConfigured(env)) return false;
  const expected = await hmac(env.SESSION_SECRET, `login:${env.ADMIN_USERNAME.trim()}\0${env.ADMIN_PASSWORD}`);
  const actual = await hmac(env.SESSION_SECRET, `login:${String(username).trim()}\0${String(password)}`);
  return safeEqual(expected, actual);
}

export async function createAdminToken(env) {
  if (!adminConfigured(env)) throw new Error("管理员账号配置不完整");
  const payload = b64url(encoder.encode(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + 86400,
    revision: await adminRevision(env)
  })));
  return `${payload}.${await hmac(env.SESSION_SECRET, `admin-session:${payload}`)}`;
}

export async function checkAdminToken(env, token) {
  if (!adminConfigured(env) || !token) return false;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !safeEqual(await hmac(env.SESSION_SECRET, `admin-session:${payload}`), signature)) return false;
  try {
    const data = JSON.parse(decoder.decode(fromB64url(payload)));
    return Number.isFinite(data.exp) && data.exp > Date.now() / 1000 &&
      safeEqual(data.revision, await adminRevision(env));
  } catch {
    return false;
  }
}
