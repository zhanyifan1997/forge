import { adminConfigured, checkAdminCredentials, checkAdminToken, checkPassword, checkUnlockToken, createAdminToken, createPasswordRecord, createUnlockToken, hmac } from "./security.js";
import { isStructuredResume, parseResume, serializeResume, validateResume } from "../public/resume.js";

const kinds = new Set(["article", "project", "resume", "link", "task", "idea", "review"]);
const publicKinds = new Set(["article", "link"]);
const protectedKinds = new Set(["project", "resume"]);
const fields = ["title", "summary", "body", "category", "url", "image_url", "status", "sort_order"];

function json(value, status = 200, headers = {}) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });
}

function error(message, status = 400) { return json({ error: message }, status); }
function parseSetting(row, fallback = null) { try { return row ? JSON.parse(row.value) : fallback; } catch { return fallback; } }
async function setting(db, key, fallback = null) { return parseSetting(await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first(), fallback); }
async function saveSetting(db, key, value) {
  await db.prepare("INSERT INTO settings (key,value,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=CURRENT_TIMESTAMP").bind(key, JSON.stringify(value)).run();
}
function cookie(request, name) {
  const all = request.headers.get("cookie") || "";
  return all.split(";").map(v => v.trim()).find(v => v.startsWith(`${name}=`))?.slice(name.length + 1) || "";
}
function mutationAllowed(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
async function unlocked(request, env) {
  const access = await setting(env.DB, "access");
  return access && await checkUnlockToken(env.SESSION_SECRET, cookie(request, "np_unlock"), access.revision);
}
function cleanEntry(input, kind) {
  const entry = {};
  for (const field of fields) entry[field] = field === "sort_order" ? Number(input[field] || 0) : String(input[field] ?? "").trim();
  if (!Number.isSafeInteger(entry.sort_order)) throw new Error("排序值必须是整数");
  if (entry.title.length > 180 || !entry.title) throw new Error("标题需要填写，且不能超过 180 字");
  if (entry.summary.length > 1000 || entry.body.length > 100000 || entry.category.length > 80) throw new Error("内容过长");
  if (entry.url && !/^https?:\/\//i.test(entry.url)) throw new Error("链接必须以 http:// 或 https:// 开头");
  if (entry.image_url && !entry.image_url.startsWith("/media/") && !/^https:\/\//i.test(entry.image_url)) throw new Error("图片地址无效");
  if (!["draft", "published", "done"].includes(entry.status)) throw new Error("状态无效");
  if (kind === "link" && !entry.url) throw new Error("链接地址需要填写");
  if (kind === "resume") {
    if (!isStructuredResume(entry.body)) throw new Error("请填写结构化简历资料");
    entry.body = serializeResume(validateResume(parseResume(entry.body)));
  }
  return entry;
}
function cleanSite(input) {
  const text = (key, max = 1000) => String(input[key] ?? "").trim().slice(0, max);
  if (!text("name", 80)) throw new Error("站点名称需要填写");
  const navigation = Array.isArray(input.navigation) ? input.navigation : [];
  const tabs = Array.isArray(input.aboutTabs) ? input.aboutTabs : [];
  const socialLinks = Array.isArray(input.socialLinks) ? input.socialLinks : [];
  const allowedNav = ["home", "articles", "links", "about"];
  const allowedTabs = ["bio", "projects", "resume"];
  const allowedPlatforms = new Set(["youtube", "x", "bilibili", "telegram", "github", "website", "email"]);
  if (socialLinks.length > 12) throw new Error("头像下方最多添加 12 个链接");
  const cleanSocialLinks = socialLinks.map(item => {
    const platform = String(item?.platform || "");
    const label = String(item?.label || "").trim();
    const url = String(item?.url || "").trim();
    if (!allowedPlatforms.has(platform) || !label || label.length > 40 || url.length > 500) throw new Error("头像链接内容无效");
    if (platform === "email" ? !/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(url) : !/^https:\/\/[^\s]+$/i.test(url)) throw new Error("链接需使用 HTTPS；邮箱使用 mailto:邮箱地址");
    return { platform, label, url };
  });
  for (const key of ["avatarUrl", "coverUrl"]) {
    const value = text(key, 500);
    if (value && !value.startsWith("/media/public/") && !/^https:\/\//i.test(value)) throw new Error("图片地址必须为公开图片或 HTTPS 地址");
  }
  const email = text("contactEmail", 200);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("联系邮箱格式无效");
  return {
    name: text("name", 80),
    tagline: text("tagline", 160),
    description: text("description", 10000),
    avatarUrl: text("avatarUrl", 500),
    coverUrl: text("coverUrl", 500),
    announcement: text("announcement", 600),
    contactEmail: email,
    socialLinks: cleanSocialLinks,
    navigation: allowedNav.map(key => {
      const item = navigation.find(row => row?.key === key);
      return { key, label: String(item?.label || { home: "首页", articles: "文章", links: "常用链接", about: "关于" }[key]).slice(0, 20), visible: item?.visible !== false };
    }),
    aboutTabs: allowedTabs.map(key => {
      const item = tabs.find(row => row?.key === key);
      return { key, label: String(item?.label || { bio: "关于我", projects: "项目", resume: "简历" }[key]).slice(0, 20) };
    })
  };
}
async function listEntries(db, kind, publishedOnly = false) {
  const sql = `SELECT * FROM entries WHERE kind = ? ${publishedOnly ? "AND status = 'published'" : ""} ORDER BY sort_order ASC, updated_at DESC`;
  return (await db.prepare(sql).bind(kind).all()).results;
}
async function handlePublic(request, env, path) {
  if (path === "/api/public/bootstrap" && request.method === "GET") {
    const [site, articles, links, access] = await Promise.all([
      setting(env.DB, "site", {}), listEntries(env.DB, "article", true), listEntries(env.DB, "link", true), setting(env.DB, "access")
    ]);
    return json({ site, articles, links, protected: Boolean(access), unlocked: access ? await unlocked(request, env) : false });
  }
  if (path === "/api/public/unlock" && request.method === "POST") {
    if (!mutationAllowed(request)) return error("请求来源无效", 403);
    const access = await setting(env.DB, "access");
    if (!access) return error("访问密码尚未设置", 403);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const clientKey = await hmac(env.SESSION_SECRET, `attempt:${ip}`);
    const now = Math.floor(Date.now() / 1000);
    const attempt = await env.DB.prepare("SELECT attempts,first_at FROM unlock_attempts WHERE client_key=?").bind(clientKey).first();
    if (attempt && now - attempt.first_at < 900 && attempt.attempts >= 5) return error("尝试次数过多，请 15 分钟后再试", 429);
    const body = await request.json().catch(() => ({}));
    const password = String(body.password || "");
    if (!await checkPassword(env.SESSION_SECRET, access, password)) {
      const count = attempt && now - attempt.first_at < 900 ? attempt.attempts + 1 : 1;
      const firstAt = attempt && now - attempt.first_at < 900 ? attempt.first_at : now;
      await env.DB.prepare("INSERT INTO unlock_attempts(client_key,attempts,first_at) VALUES(?,?,?) ON CONFLICT(client_key) DO UPDATE SET attempts=excluded.attempts,first_at=excluded.first_at").bind(clientKey, count, firstAt).run();
      return error("密码不正确", 401);
    }
    await env.DB.prepare("DELETE FROM unlock_attempts WHERE client_key=?").bind(clientKey).run();
    const token = await createUnlockToken(env.SESSION_SECRET, access.revision);
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return json({ ok: true }, 200, { "set-cookie": `np_unlock=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure}` });
  }
  const match = path.match(/^\/api\/public\/entries\/(article|link|project|resume)(?:\/([^/]+))?$/);
  if (match && request.method === "GET") {
    const [, kind, id] = match;
    if (protectedKinds.has(kind) && !await unlocked(request, env)) return error("请先输入访问密码", 403);
    if (!publicKinds.has(kind) && !protectedKinds.has(kind)) return error("内容不存在", 404);
    if (id) {
      const row = await env.DB.prepare("SELECT * FROM entries WHERE id=? AND kind=? AND status='published'").bind(id, kind).first();
      return row ? json(row) : error("内容不存在", 404);
    }
    return json(await listEntries(env.DB, kind, true));
  }
  return error("接口不存在", 404);
}
async function handleAdmin(request, env, path) {
  if (!["GET", "HEAD"].includes(request.method) && !mutationAllowed(request)) return error("请求来源无效", 403);
  if (path === "/api/admin/login" && request.method === "POST") {
    if (!adminConfigured(env)) return error("请先配置 ADMIN_USERNAME、ADMIN_PASSWORD 和 SESSION_SECRET", 503);
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const clientKey = await hmac(env.SESSION_SECRET, `admin-login:${ip}`);
    const now = Math.floor(Date.now() / 1000);
    const attempt = await env.DB.prepare("SELECT attempts,first_at FROM unlock_attempts WHERE client_key=?").bind(clientKey).first();
    if (attempt && now - attempt.first_at < 900 && attempt.attempts >= 5) return error("尝试次数过多，请 15 分钟后再试", 429);
    const body = await request.json().catch(() => ({}));
    if (!await checkAdminCredentials(env, body?.username || "", body?.password || "")) {
      const count = attempt && now - attempt.first_at < 900 ? attempt.attempts + 1 : 1;
      const firstAt = attempt && now - attempt.first_at < 900 ? attempt.first_at : now;
      await env.DB.prepare("INSERT INTO unlock_attempts(client_key,attempts,first_at) VALUES(?,?,?) ON CONFLICT(client_key) DO UPDATE SET attempts=excluded.attempts,first_at=excluded.first_at").bind(clientKey, count, firstAt).run();
      return error("用户名或密码错误", 401);
    }
    await env.DB.prepare("DELETE FROM unlock_attempts WHERE client_key=?").bind(clientKey).run();
    const token = await createAdminToken(env);
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return json({ ok: true }, 200, { "set-cookie": `np_admin=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400${secure}` });
  }
  if (path === "/api/admin/logout" && request.method === "POST") {
    const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
    return json({ ok: true }, 200, { "set-cookie": `np_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}` });
  }
  if (!await checkAdminToken(env, cookie(request, "np_admin"))) return error("请先登录管理员账号", 401);
  if (path === "/api/admin/bootstrap" && request.method === "GET") {
    const site = await setting(env.DB, "site", {});
    const access = await setting(env.DB, "access");
    return json({ site, accessConfigured: Boolean(access) });
  }
  if (path === "/api/admin/site" && request.method === "PUT") {
    const body = await request.json().catch(() => ({}));
    let site;
    try { site = cleanSite(body); }
    catch (cause) { return error(cause.message); }
    await saveSetting(env.DB, "site", site);
    return json(site);
  }
  if (path === "/api/admin/access" && request.method === "PUT") {
    const body = await request.json().catch(() => ({}));
    const record = await createPasswordRecord(env.SESSION_SECRET, String(body.password || ""));
    await saveSetting(env.DB, "access", record);
    return json({ ok: true });
  }
  const match = path.match(/^\/api\/admin\/entries\/(article|project|resume|link|task|idea|review)(?:\/([^/]+))?$/);
  if (match) {
    const [, kind, id] = match;
    if (!kinds.has(kind)) return error("类别无效");
    if (request.method === "GET" && !id) return json(await listEntries(env.DB, kind));
    if (request.method === "POST" && !id) {
      let entry;
      try { entry = cleanEntry(await request.json(), kind); }
      catch (cause) { return error(cause.message); }
      const newId = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO entries(id,kind,title,summary,body,category,url,image_url,status,sort_order) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(newId, kind, ...fields.map(key => entry[key])).run();
      return json({ id: newId }, 201);
    }
    if (id && request.method === "PUT") {
      let entry;
      try { entry = cleanEntry(await request.json(), kind); }
      catch (cause) { return error(cause.message); }
      const result = await env.DB.prepare("UPDATE entries SET title=?,summary=?,body=?,category=?,url=?,image_url=?,status=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND kind=?").bind(...fields.map(key => entry[key]), id, kind).run();
      return result.meta.changes ? json({ ok: true }) : error("内容不存在", 404);
    }
    if (id && request.method === "DELETE") {
      const result = await env.DB.prepare("DELETE FROM entries WHERE id=? AND kind=?").bind(id, kind).run();
      return result.meta.changes ? json({ ok: true }) : error("内容不存在", 404);
    }
  }
  if (path === "/api/admin/media" && request.method === "POST") {
    if (!env.MEDIA) return error("R2 尚未绑定", 503);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 5_000_000 || file.size === 0) return error("请选择小于 5 MB 的图片");
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" }[file.type];
    if (!ext) return error("仅支持 JPG、PNG、WebP 或 GIF");
    const scope = form.get("scope") === "private" ? "private" : "public";
    const key = `${scope}/${crypto.randomUUID()}.${ext}`;
    await env.MEDIA.put(key, file, { httpMetadata: { contentType: file.type } });
    return json({ url: `/media/${key}` }, 201);
  }
  return error("接口不存在", 404);
}
async function handleMedia(request, env, path) {
  if (request.method !== "GET") return error("请求方式不支持", 405);
  const key = path.slice("/media/".length);
  if (!/^(public|private)\/[a-f0-9-]+\.(jpg|png|webp|gif)$/.test(key)) return error("图片不存在", 404);
  if (key.startsWith("private/") && !await unlocked(request, env) && !await checkAdminToken(env, cookie(request, "np_admin"))) return error("请先输入访问密码", 403);
  const object = await env.MEDIA.get(key);
  if (!object) return error("图片不存在", 404);
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType || "application/octet-stream", "cache-control": key.startsWith("public/") ? "public, max-age=31536000, immutable" : "private, no-store", "x-content-type-options": "nosniff" } });
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    try {
      if (path.startsWith("/api/public/")) return await handlePublic(request, env, path);
      if (path.startsWith("/api/admin/")) return await handleAdmin(request, env, path);
      if (path.startsWith("/media/")) return await handleMedia(request, env, path);
      return env.ASSETS.fetch(request);
    } catch (cause) {
      if (cause instanceof SyntaxError) return error("请求内容格式无效");
      if (cause.message?.includes("SESSION_SECRET") || cause.message?.includes("访问密码")) return error(cause.message);
      console.error(cause);
      return error("服务器处理失败，请检查 D1 迁移和环境配置", 500);
    }
  }
};
