const encoder = new TextEncoder();
const decoder = new TextDecoder();
let cachedJwks = { until: 0, keys: [] };

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

export async function verifyAccess(request, env) {
  const host = new URL(request.url).hostname;
  if (env.DEV_ADMIN_BYPASS === "true" && (host === "localhost" || host === "127.0.0.1")) return true;
  const domain = String(env.ACCESS_TEAM_DOMAIN || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const aud = env.ACCESS_AUD;
  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!domain || !aud || !token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const header = JSON.parse(decoder.decode(fromB64url(parts[0])));
    const payload = JSON.parse(decoder.decode(fromB64url(parts[1])));
    if (header.alg !== "RS256" || !header.kid || payload.iss !== `https://${domain}`) return false;
    if (!(Array.isArray(payload.aud) ? payload.aud.includes(aud) : payload.aud === aud)) return false;
    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || payload.exp <= now || (payload.nbf && payload.nbf > now)) return false;
    if (cachedJwks.until < Date.now()) {
      const response = await fetch(`https://${domain}/cdn-cgi/access/certs`);
      if (!response.ok) return false;
      const certs = await response.json();
      cachedJwks = { keys: certs.keys || [], until: Date.now() + 300000 };
    }
    const jwk = cachedJwks.keys.find(key => key.kid === header.kid);
    if (!jwk) return false;
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(parts[2]), encoder.encode(`${parts[0]}.${parts[1]}`));
  } catch {
    return false;
  }
}
