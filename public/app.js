import { renderMarkdown } from "./markdown.js";
import { blankResume, parseResume, serializeResume, validateResume } from "./resume.js";

const app = document.querySelector("#app");
const isAdmin = document.body.dataset.mode === "admin";
const menu = [
  ["overview", "概览"], ["article", "文章管理"], ["project", "项目管理"],
  ["resume", "简历管理"], ["link", "链接管理"], ["task", "待办事项"],
  ["idea", "想法收集"], ["review", "每周回顾"], ["site", "站点资料"],
  ["access", "访问权限"]
];
const names = { article: "文章", project: "项目", resume: "简历", link: "链接", task: "待办", idea: "想法", review: "回顾" };
const socialPlatforms = [["youtube", "YouTube"], ["x", "X"], ["bilibili", "哔哩哔哩"], ["telegram", "Telegram"], ["github", "GitHub"], ["website", "网站"], ["email", "邮箱"]];
const resumeSections = {
  experience: { label: "工作经历", fields: [["organization", "公司 / 组织"], ["role", "职位"], ["period", "起止时间"], ["location", "地点"], ["description", "主要成果与职责", "textarea"]] },
  education: { label: "教育经历", fields: [["school", "学校"], ["degree", "学历 / 专业"], ["period", "起止时间"], ["description", "补充说明", "textarea"]] },
  projects: { label: "项目经历", fields: [["name", "项目名称"], ["role", "角色"], ["period", "起止时间"], ["url", "项目链接"], ["description", "项目成果", "textarea"]] },
  skills: { label: "专业技能", fields: [["category", "技能类别"], ["items", "技能项（逗号或换行分隔）", "textarea"]] }
};
const state = {
  site: null, articles: [], links: [], protected: false, unlocked: false,
  page: "home", tab: "bio", category: "全部", detail: null, modal: null,
  adminPage: "overview", rows: [], editId: null, feedback: ""
};

const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const attr = esc;
function plainMarkdown(value) {
  const node = document.createElement("div");
  node.innerHTML = renderMarkdown(value);
  return node.textContent?.replace(/\s+/g, " ").trim() || "";
}
const fmtDate = value => value ? new Date(value.replace(" ", "T") + (value.includes("Z") ? "" : "Z")).toLocaleDateString("zh-CN") : "";
const ico = (name, size = 17) => {
  const paths = {
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    link: '<path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2"/>',
    pen: '<path d="m4 20 4-.8L20 7.2 16.8 4 4.8 16zM14.5 6.5l3 3"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 16 5-5 4 4 3-3 6 6"/>',
    file: '<path d="M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M8 13h7M8 17h7"/>'
  };
  return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.link}</svg>`;
};
async function api(path, options = {}) {
  const response = await fetch(path, { credentials: "same-origin", ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const cause = new Error(data.error || `请求失败：${response.status}`);
    cause.status = response.status;
    throw cause;
  }
  return data;
}
function navItems() {
  return state.site?.navigation?.filter(item => item.visible !== false) || [];
}
function navButton(item, className = "") {
  return `<button class="nav-button ${state.page === item.key ? "active" : ""} ${className}" data-page="${attr(item.key)}">${esc(item.label)}</button>`;
}
function avatar() {
  return state.site?.avatarUrl ? `<img src="${attr(state.site.avatarUrl)}" alt="头像">` : esc((state.site?.name || "N").slice(0, 1).toUpperCase());
}
function brand() {
  return '<img class="brand-logo" src="/brand/neuralperch-logo.png" alt="Neuralperch 神经鲈鱼">';
}
function socialGlyph(platform) {
  if (platform === "youtube") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M22 7.2a3 3 0 0 0-2.1-2.1C18 4.6 12 4.6 12 4.6s-6 0-7.9.5A3 3 0 0 0 2 7.2a31 31 0 0 0 0 9.6 3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 0-9.6ZM10 15.4V8.6l5.8 3.4-5.8 3.4Z"/></svg>';
  if (platform === "telegram") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m21.4 3.3-3.3 16a1 1 0 0 1-1.5.6l-4.5-3.3-2.3 2.2a.8.8 0 0 1-1.3-.5l-.4-4.5L19 5.8 6.1 12.9l-3.3-1.1a1 1 0 0 1 0-1.9l17.3-7.4a1 1 0 0 1 1.3.8Z"/></svg>';
  if (platform === "email") return '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" d="M3 6h18v12H3zM3 7l9 7 9-7"/></svg>';
  if (platform === "website") return '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  return { x: "𝕏", bilibili: "bili", github: "GH" }[platform] || "↗";
}
function socialLinks() {
  const rows = state.site?.socialLinks || [];
  return rows.length ? `<div class="social-links" aria-label="社交与联系链接">${rows.map(item => `<a class="social-link social-${attr(item.platform)}" href="${attr(item.url)}" target="_blank" rel="noopener noreferrer" aria-label="${attr(item.label)}" title="${attr(item.label)}">${socialGlyph(item.platform)}</a>`).join("")}</div>` : "";
}
function publicFrame(content) {
  const site = state.site || {};
  const nav = navItems();
  return `${site.coverUrl ? `<div class="site-backdrop" aria-hidden="true"><img src="${attr(site.coverUrl)}" alt=""></div>` : ""}<div class="shell public-shell ${site.coverUrl ? "has-cover" : ""}">
    <header class="topbar"><a class="brand" href="#home" data-page="home">${brand()}</a>
      <nav class="topnav" aria-label="主导航">${nav.map(item => navButton(item)).join("")}</nav>
      <div class="top-actions"><button class="icon-button" aria-label="查看文章" data-page="articles">${ico("search", 18)}</button></div>
    </header>
    <div class="layout">
      <aside class="profile panel"><div class="avatar">${avatar()}</div><h2>${esc(site.name || "个人站")}</h2>
        <p class="profile-summary">${esc(site.tagline || "一句话介绍待填写")}</p>
        ${socialLinks()}
        <nav class="side-nav" aria-label="侧边导航">${nav.map(item => navButton(item)).join("")}</nav>
      </aside>
      <main class="main-column" id="main-content">${content}</main>
      <aside class="right-column">${rail()}</aside>
    </div><footer class="footer">© ${new Date().getFullYear()} ${esc(site.name || "个人站")}</footer>
    ${state.modal ? renderModal() : ""}
  </div>`;
}
function rail() {
  const categories = [...new Set(state.articles.map(item => item.category).filter(Boolean))];
  const links = state.links.slice(0, 5);
  return `<section class="rail-card panel"><h3>文章分类</h3>
    ${categories.length ? categories.map(cat => `<button class="rail-row" style="width:100%;border-left:0;border-right:0;border-bottom:0;background:none;text-align:left" data-category="${attr(cat)}"><span>${esc(cat)}</span><span>→</span></button>`).join("") : '<div class="empty">分类会随文章显示</div>'}</section>
    <section class="rail-card panel"><h3>常用链接</h3>
    ${links.length ? links.map(item => `<a class="rail-row" href="${attr(item.url)}" target="_blank" rel="noopener noreferrer"><span>${esc(item.title)}</span><span>↗</span></a>`).join("") : '<div class="empty">在后台添加链接</div>'}</section>
    ${state.site?.announcement ? `<section class="rail-card panel"><h3>站点公告</h3><p class="notice">${esc(state.site.announcement)}</p></section>` : ""}`;
}
function entryCard(item) {
  const description = item.kind === "resume" ? (item.summary || parseResume(item.body).headline || "查看简历") : (item.summary || plainMarkdown(item.body).slice(0, 90) || "点击查看内容");
  return `<button class="entry-card" data-detail="${attr(item.kind)}:${attr(item.id)}">
    <div class="thumb">${item.image_url ? `<img src="${attr(item.image_url)}" alt="">` : ico(item.kind === "resume" ? "file" : "image", 25)}</div>
    <div><h3>${esc(item.title)}</h3><p>${esc(description)}</p>
    <div class="meta">${item.category ? `<span class="pill">${esc(item.category)}</span>` : ""}<span>${fmtDate(item.updated_at)}</span></div></div></button>`;
}
function homePage() {
  const site = state.site || {};
  return `<section class="hero-panel panel"><div class="eyebrow">${esc(site.name || "个人站")} · PERSONAL SPACE</div>
    <h1>${esc(site.tagline || "一句话介绍待填写")}</h1>
    <p>${esc(site.description ? plainMarkdown(site.description).slice(0, 140) : "在后台填写个人介绍后，这里会展示给访客。")}</p></section>
    <section class="section-card panel"><div class="section-head"><h2>最新文章</h2><button class="more" data-page="articles">查看全部 ${ico("arrow", 14)}</button></div>
      <div class="entry-list">${state.articles.length ? state.articles.slice(0, 4).map(entryCard).join("") : '<div class="empty">还没有发布文章。发布后会显示在这里。</div>'}</div></section>
    <section class="section-card panel"><div class="section-head"><h2>关于我</h2><button class="more" data-page="about">了解更多 ${ico("arrow", 14)}</button></div>
      <div class="bio markdown-body">${renderMarkdown(site.description || "个人介绍待填写。")}</div></section>`;
}
function articlesPage() {
  const categories = ["全部", ...new Set(state.articles.map(row => row.category).filter(Boolean))];
  const rows = state.category === "全部" ? state.articles : state.articles.filter(row => row.category === state.category);
  return `<section class="section-card panel"><h1 class="page-title">文章</h1><div class="toolbar">${categories.map(cat => `<button class="chip ${state.category === cat ? "active" : ""}" data-category="${attr(cat)}">${esc(cat)}</button>`).join("")}</div>
    <div class="entry-list">${rows.length ? rows.map(entryCard).join("") : '<div class="empty">这个分类还没有文章。</div>'}</div></section>`;
}
function linksPage() {
  return `<section class="section-card panel"><h1 class="page-title">常用链接</h1>
    ${state.links.length ? `<div class="link-grid">${state.links.map(item => `<a class="link-tile" href="${attr(item.url)}" target="_blank" rel="noopener noreferrer"><span><strong>${esc(item.title)}</strong><small>${esc(item.summary || item.category || item.url)}</small></span><span>${ico("arrow", 16)}</span></a>`).join("")}</div>` : '<div class="empty">链接尚未添加。可在后台按需要维护。</div>'}</section>`;
}
function aboutPage() {
  const tabs = state.site?.aboutTabs || [{ key: "bio", label: "关于我" }, { key: "projects", label: "项目" }, { key: "resume", label: "简历" }];
  let body = "";
  if (state.tab === "bio") body = `<h1 class="page-title">关于我</h1><div class="bio markdown-body">${renderMarkdown(state.site?.description || "个人介绍待填写。")}</div>${state.site?.contactEmail ? `<p class="notice">联系邮箱：<a href="mailto:${attr(state.site.contactEmail)}">${esc(state.site.contactEmail)}</a></p>` : ""}`;
  else if (!state.unlocked) body = state.protected ? `<div class="lock-note">此内容需要访问密码。输入密码后即可查看「项目」和「简历」。</div><button class="primary" data-unlock="1">输入访问密码</button>` : '<div class="lock-note">此内容暂未开放。请稍后再来查看。</div>';
  else if (state.detail?.kind === (state.tab === "projects" ? "project" : "resume")) body = detailPage(state.detail, true);
  else body = `<div class="entry-list" id="protected-entries"><div class="empty">正在加载内容…</div></div>`;
  return `<section class="section-card panel"><div class="tabs" role="tablist">${tabs.map(tab => `<button role="tab" aria-selected="${state.tab === tab.key}" class="tab ${state.tab === tab.key ? "active" : ""}" data-tab="${attr(tab.key)}">${esc(tab.label)} ${tab.key !== "bio" ? ico("lock", 12) : ""}</button>`).join("")}</div>${body}</section>`;
}
function detailPage(item, inline = false) {
  if (item.kind === "resume") return resumeDetailPage(item);
  return `${inline ? `<button class="text-button" data-back-about="1">← 返回列表</button>` : `<button class="text-button" data-back="1">← 返回文章</button>`}
    <h1 class="page-title" style="margin-top:15px">${esc(item.title)}</h1>
    <div class="meta" style="margin-bottom:20px">${item.category ? `<span class="pill">${esc(item.category)}</span>` : ""}<span>${fmtDate(item.updated_at)}</span></div>
    ${item.image_url ? `<img src="${attr(item.image_url)}" alt="" style="width:100%;max-height:330px;object-fit:cover;border-radius:12px;margin-bottom:20px">` : ""}
    <div class="detail-body markdown-body">${renderMarkdown(item.body || item.summary)}</div>
    ${item.url ? `<p style="margin-top:22px"><a class="primary" href="${attr(item.url)}" target="_blank" rel="noopener noreferrer">查看相关链接 ↗</a></p>` : ""}`;
}
function resumeDetailPage(item) {
  return `<button class="text-button" data-back-about="1">← 返回简历列表</button>${renderResume(parseResume(item.body))}`;
}
function renderResume(resume) {
  const contact = [
    resume.email ? `<a href="mailto:${attr(resume.email)}">${esc(resume.email)}</a>` : "",
    resume.phone ? `<span>${esc(resume.phone)}</span>` : "",
    resume.location ? `<span>${esc(resume.location)}</span>` : "",
    resume.website ? `<a href="${attr(resume.website)}" target="_blank" rel="noopener noreferrer">${esc(resume.website.replace(/^https:\/\//, ""))}</a>` : ""
  ].filter(Boolean).join("");
  const timeline = (title, rows, makeRow) => rows.length ? `<section class="resume-section"><h2>${title}</h2><div class="resume-section-content">${rows.map(makeRow).join("")}</div></section>` : "";
  return `<article class="resume-sheet">
    <header class="resume-header"><span class="resume-kicker">RESUME / 个人简历</span><h1>${esc(resume.name || "姓名待填写")}</h1>
      ${resume.headline ? `<p class="resume-headline">${esc(resume.headline)}</p>` : ""}
      ${contact ? `<div class="resume-contact">${contact}</div>` : ""}</header>
    <div class="resume-content">
      ${resume.summary ? `<section class="resume-section"><h2>个人简介</h2><div class="resume-section-content markdown-body">${renderMarkdown(resume.summary)}</div></section>` : ""}
      ${timeline("工作经历", resume.experience, row => `<div class="resume-item"><div class="resume-item-head"><div><h3>${esc(row.role || row.organization)}</h3><strong>${esc(row.organization)}</strong></div><span>${esc(row.period)}</span></div>${row.location ? `<small>${esc(row.location)}</small>` : ""}${row.description ? `<div class="markdown-body">${renderMarkdown(row.description)}</div>` : ""}</div>`)}
      ${timeline("项目经历", resume.projects, row => `<div class="resume-item"><div class="resume-item-head"><div><h3>${esc(row.name)}</h3>${row.role ? `<strong>${esc(row.role)}</strong>` : ""}</div><span>${esc(row.period)}</span></div>${row.url ? `<a class="resume-project-link" href="${attr(row.url)}" target="_blank" rel="noopener noreferrer">查看项目 ↗</a>` : ""}${row.description ? `<div class="markdown-body">${renderMarkdown(row.description)}</div>` : ""}</div>`)}
      ${timeline("教育经历", resume.education, row => `<div class="resume-item"><div class="resume-item-head"><div><h3>${esc(row.school)}</h3><strong>${esc(row.degree)}</strong></div><span>${esc(row.period)}</span></div>${row.description ? `<div class="markdown-body">${renderMarkdown(row.description)}</div>` : ""}</div>`)}
      ${timeline("专业技能", resume.skills, row => `<div class="resume-skill-group"><h3>${esc(row.category)}</h3><div class="resume-skill-list">${row.items.split(/[,，\n]/).map(value => value.trim()).filter(Boolean).map(value => `<span>${esc(value)}</span>`).join("")}</div></div>`)}
      ${resume.additional ? `<section class="resume-section"><h2>补充信息</h2><div class="resume-section-content markdown-body">${renderMarkdown(resume.additional)}</div></section>` : ""}
    </div></article>`;
}
function renderModal() {
  if (state.modal !== "unlock") return "";
  return `<div class="modal-backdrop" role="presentation"><form class="modal" id="unlock-form"><h2>访问受保护内容</h2>
    <p>请输入访问密码，解锁项目与简历。</p><div class="field"><label for="unlock-password">访问密码</label><input id="unlock-password" name="password" type="password" autocomplete="current-password" required autofocus placeholder="请输入访问密码"></div>
    <div class="actions"><button class="primary" type="submit">解锁查看</button><button class="secondary" type="button" data-close-modal="1">取消</button></div>
    <div id="modal-feedback" class="feedback error" role="status"></div></form></div>`;
}
function renderPublic() {
  if (!state.site) { app.innerHTML = '<div class="shell"><div class="panel section-card">正在加载网站…</div></div>'; return; }
  let body;
  if (state.page === "articles") body = state.detail?.kind === "article" ? `<section class="section-card panel">${detailPage(state.detail)}</section>` : articlesPage();
  else if (state.page === "links") body = linksPage();
  else if (state.page === "about") body = aboutPage();
  else body = homePage();
  app.innerHTML = publicFrame(body);
  document.title = `${state.page === "home" ? "" : (navItems().find(item => item.key === state.page)?.label || "") + " · "}${state.site.name}`;
  if (state.page === "about" && state.tab !== "bio" && state.unlocked && !state.detail) loadProtected();
}
async function loadProtected() {
  const kind = state.tab === "projects" ? "project" : "resume";
  try {
    const rows = await api(`/api/public/entries/${kind}`);
    const container = document.querySelector("#protected-entries");
    if (container && state.page === "about") container.innerHTML = rows.length ? rows.map(entryCard).join("") : '<div class="empty">这里还没有发布内容。</div>';
  } catch (cause) {
    state.unlocked = false;
    renderPublic();
  }
}
async function initPublic() {
  try {
    const data = await api("/api/public/bootstrap");
    Object.assign(state, data);
    await applyRouteFromHash();
    renderPublic();
  } catch (cause) {
    app.innerHTML = `<div class="shell"><div class="section-card panel">无法加载网站：${esc(cause.message)}。请先运行 D1 数据库迁移。</div></div>`;
  }
}
async function applyRouteFromHash() {
  const [page, id] = location.hash.slice(1).split("/");
  state.detail = null;
  if (page === "article" && id) {
    state.page = "articles";
    state.detail = await api(`/api/public/entries/article/${encodeURIComponent(id)}`).catch(() => null);
  } else if ((page === "project" || page === "resume") && id) {
    state.page = "about";
    state.tab = page === "project" ? "projects" : "resume";
    if (state.unlocked) state.detail = await api(`/api/public/entries/${page}/${encodeURIComponent(id)}`).catch(() => null);
    else { state.pendingDetail = { kind: page, id }; state.modal = state.protected ? "unlock" : null; }
  } else {
    state.page = ["home", "articles", "links", "about"].includes(page) ? page : "home";
    state.tab = page === "about" && ["bio", "projects", "resume"].includes(id) ? id : "bio";
  }
}
function adminFrame(content) {
  return `<div class="shell"><header class="topbar"><a class="brand" href="/">${brand()}</a><div class="top-actions"><a class="secondary" href="/" target="_blank" rel="noopener noreferrer">查看网站 ↗</a><button class="secondary" data-admin-logout="1">退出登录</button></div></header>
    <div class="admin-layout"><aside class="admin-sidebar panel"><nav class="admin-menu" aria-label="后台菜单">${menu.map(([key,label]) => `<button class="${state.adminPage === key ? "active" : ""}" data-admin-page="${key}">${label}</button>`).join("")}</nav></aside>
    <main class="admin-main panel">${content}</main></div></div>`;
}
function adminOverview() {
  return `<div class="admin-head"><div><h1>概览</h1><p>在这里管理站点内容和访问方式。</p></div></div>
    <div class="form-panel"><h2>开始编辑</h2><div class="link-grid">
      <button class="link-tile" data-admin-page="site"><span><strong>站点资料</strong><small>头像、简介、社交链接与导航</small></span>${ico("arrow")}</button>
      <button class="link-tile" data-admin-page="article"><span><strong>文章管理</strong><small>创建草稿并发布文章</small></span>${ico("arrow")}</button>
      <button class="link-tile" data-admin-page="access"><span><strong>访问权限</strong><small>设置项目与简历的访问密码</small></span>${ico("arrow")}</button>
      <button class="link-tile" data-admin-page="task"><span><strong>待办事项</strong><small>管理只在后台显示的任务</small></span>${ico("arrow")}</button>
    </div></div>`;
}
function markdownEditor(id, label, value, scope = "public") {
  const buttons = [
    ["heading", "标题"], ["bold", "加粗"], ["italic", "斜体"],
    ["link", "链接"], ["quote", "引用"], ["list", "列表"],
    ["code", "代码"], ["image", "插入图片"]
  ];
  return `<div class="field wide"><label for="${id}">${label} <span class="muted">· Markdown</span></label>
    <div class="markdown-editor" data-upload-scope="${scope}">
      <div class="editor-toolbar" role="toolbar" aria-label="Markdown 编辑工具">${buttons.map(([action, text]) => `<button type="button" data-editor-action="${action}" title="${text}">${text}</button>`).join("")}</div>
      <div class="editor-panels"><div class="editor-pane"><div class="editor-caption">编辑 Markdown</div><textarea id="${id}" name="${id === "entry-body" ? "body" : id}" spellcheck="false" placeholder="开始写作，支持标题、列表、链接、图片和代码块…">${esc(value)}</textarea></div>
        <div class="editor-pane editor-preview-pane"><div class="editor-caption">实时预览</div><div class="editor-preview markdown-body">${value ? renderMarkdown(value) : '<p class="muted">预览会在这里显示</p>'}</div></div></div>
      <input class="editor-image-file" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden>
    </div><small class="editor-hint">支持标准 Markdown；图片上传后会插入到光标位置。请保存表单完成发布。</small></div>`;
}
function socialLinkRow(item = {}) {
  return `<div class="social-config-row" data-social-row>
    <select data-social-platform aria-label="平台">${socialPlatforms.map(([value, label]) => `<option value="${value}" ${item.platform === value ? "selected" : ""}>${label}</option>`).join("")}</select>
    <input data-social-label aria-label="链接名称" maxlength="40" placeholder="名称" value="${attr(item.label || "")}" required>
    <input data-social-url aria-label="链接地址" type="text" inputmode="url" maxlength="500" placeholder="https://… 或 mailto:…" value="${attr(item.url || "")}" required>
    <button class="text-button delete" type="button" data-remove-social="1" aria-label="删除这条链接">删除</button>
  </div>`;
}
function siteForm() {
  const site = state.site || {};
  const field = (id, label, value, textarea = false) => `<div class="field ${textarea ? "wide" : ""}"><label for="${id}">${label}</label>${textarea ? `<textarea id="${id}" name="${id}">${esc(value)}</textarea>` : `<input id="${id}" name="${id}" value="${attr(value)}">`}</div>`;
  return `<div class="admin-head"><div><h1>站点资料</h1><p>这里保存的内容会显示在公开页面。</p></div></div>
    <form id="site-form"><div class="form-panel"><h2>个人形象</h2><div class="form-grid">
      ${field("name","站点名称",site.name)}
      ${field("tagline","一句话描述",site.tagline)}
      ${markdownEditor("description","关于我 / 个人介绍",site.description)}
      ${field("announcement","站点公告",site.announcement,true)}
      ${field("contactEmail","联系邮箱",site.contactEmail)}
      ${field("avatarUrl","头像地址",site.avatarUrl)}
      <div class="field wide"><label>上传头像</label><div class="upload-box">${site.avatarUrl ? `<img src="${attr(site.avatarUrl)}" alt="当前头像">` : ""}<input type="file" id="avatar-file" accept="image/jpeg,image/png,image/webp,image/gif"><button type="button" class="secondary" data-upload="avatar">上传并使用</button></div></div>
      ${field("coverUrl","页面背景图片地址",site.coverUrl)}
      <div class="field wide"><label>上传页面背景</label><div class="upload-box"><input type="file" id="cover-file" accept="image/jpeg,image/png,image/webp,image/gif"><button type="button" class="secondary" data-upload="cover">上传并使用</button></div></div>
    </div></div>
    <div class="form-panel"><div class="social-config-head"><div><h2>头像下方的链接</h2><p class="muted">选择平台，填写名称和地址。保存后显示在头像下方。</p></div><button class="secondary" type="button" data-add-social="1">＋ 添加链接</button></div>
      <div id="social-link-list">${(site.socialLinks || []).map(socialLinkRow).join("")}</div>
    </div>
    <div class="form-panel"><h2>顶部与侧边导航</h2>
      ${(site.navigation || []).map(item => `<div class="toggle-row"><span>${esc(item.key)}</span><input aria-label="${esc(item.key)} 标签" data-nav-label="${attr(item.key)}" value="${attr(item.label)}" style="max-width:220px;border:1px solid var(--line);border-radius:8px;padding:7px"><label><input type="checkbox" data-nav-visible="${attr(item.key)}" ${item.visible ? "checked" : ""}> 显示</label></div>`).join("")}
    </div>
    <div class="form-panel"><h2>「关于」顶部 Tab</h2>
      ${(site.aboutTabs || []).map(item => `<div class="toggle-row"><span>${esc(item.key)}</span><input aria-label="${esc(item.key)} 标签" data-tab-label="${attr(item.key)}" value="${attr(item.label)}" style="max-width:220px;border:1px solid var(--line);border-radius:8px;padding:7px"></div>`).join("")}
    </div><div class="actions" style="margin-top:18px"><button class="primary">保存站点资料</button><span id="admin-feedback" class="feedback" role="status"></span></div></form>`;
}
function accessForm() {
  return `<div class="admin-head"><div><h1>访问权限</h1><p>项目和简历共用一组访问密码。</p></div></div>
    <div class="lock-note">密码验证在 Worker 服务端完成。未解锁时，项目与简历内容不会返回给访客。</div>
    <form id="access-form" class="form-panel"><h2>${state.accessConfigured ? "更换访问密码" : "设置访问密码"}</h2>
      <div class="field"><label for="access-password">新密码</label><input id="access-password" type="password" name="password" autocomplete="new-password" minlength="8" required placeholder="至少 8 个字符"></div>
      <div class="actions"><button class="primary">保存密码</button><span id="admin-feedback" class="feedback" role="status"></span></div></form>`;
}
function resumeInput(key, label, value = "", area = false, required = false, row = false) {
  const marker = row ? `data-resume-field="${key}"` : `data-resume-key="${key}"`;
  const type = key === "email" ? "email" : key === "website" || key === "url" ? "url" : "text";
  return `<div class="field ${area ? "wide" : ""}"><label>${label}${area ? `<textarea ${marker} ${required ? "required" : ""}>${esc(value)}</textarea>` : `<input ${marker} type="${type}" value="${attr(value)}" ${required ? "required" : ""}>`}</label></div>`;
}
function resumeRow(section, item = {}) {
  const fields = resumeSections[section].fields;
  return `<div class="resume-edit-row" data-resume-row="${section}"><div class="resume-edit-row-head"><strong>${resumeSections[section].label}条目</strong><button type="button" class="text-button delete" data-resume-remove="1">删除</button></div>
    <div class="form-grid">${fields.map(([key, label, type]) => resumeInput(key, label, item[key], type === "textarea", false, true)).join("")}</div></div>`;
}
function resumeEditorSection(section, rows) {
  return `<div class="form-panel"><div class="resume-edit-head"><h2>${resumeSections[section].label}</h2><button type="button" class="secondary" data-resume-add="${section}">＋ 添加</button></div>
    <div data-resume-list="${section}">${rows.map(row => resumeRow(section, row)).join("")}</div></div>`;
}
function resumeForm(item = {}) {
  const resume = parseResume(item.body);
  return `<form id="entry-form" class="resume-form" data-kind="resume" data-id="${attr(item.id || "")}">
    <div class="form-panel"><h2>${item.id ? "编辑" : "新建"}简历</h2><div class="form-grid">
      <div class="field wide"><label for="resume-title">列表标题（可选）</label><input id="resume-title" name="title" maxlength="180" value="${attr(item.title)}" placeholder="留空时使用姓名"></div>
    </div><p class="notice">列表标题只用于简历列表；简历页面以姓名为主标题。</p></div>
    <div class="form-panel"><h2>基本资料</h2><div class="form-grid">
      ${resumeInput("name", "姓名", resume.name, false, true)}
      ${resumeInput("headline", "职业方向 / 职位", resume.headline)}
      ${resumeInput("email", "邮箱", resume.email)}
      ${resumeInput("phone", "电话", resume.phone)}
      ${resumeInput("location", "所在地", resume.location)}
      ${resumeInput("website", "个人网站 / 作品集", resume.website)}
      ${resumeInput("summary", "个人简介", resume.summary, true)}
    </div></div>
    ${resumeEditorSection("experience", resume.experience)}
    ${resumeEditorSection("projects", resume.projects)}
    ${resumeEditorSection("education", resume.education)}
    ${resumeEditorSection("skills", resume.skills)}
    <div class="form-panel"><h2>补充信息</h2>${markdownEditor("resume-additional", "其他经历、证书或荣誉", resume.additional, "private")}</div>
    <div class="form-panel"><div class="form-grid"><div class="field"><label for="resume-status">状态</label><select id="resume-status" name="status"><option value="draft" ${(item.status || "draft") === "draft" ? "selected" : ""}>草稿</option><option value="published" ${item.status === "published" ? "selected" : ""}>已发布</option></select></div>
      <div class="field"><label for="resume-order">排序</label><input id="resume-order" name="sort_order" type="number" value="${attr(item.sort_order ?? 0)}"></div></div>
      <div class="actions"><button class="primary">保存简历</button><button class="secondary" type="button" data-cancel-edit="1">取消</button><span id="admin-feedback" class="feedback" role="status"></span></div></div>
    <details class="resume-preview"><summary data-resume-preview="1">预览简历版式</summary><div id="resume-preview-content">${renderResume(resume)}</div></details>
  </form>`;
}
function collectResume(form) {
  const resume = blankResume();
  for (const key of ["name", "headline", "email", "phone", "location", "website", "summary"]) resume[key] = form.querySelector(`[data-resume-key="${key}"]`)?.value || "";
  resume.additional = form.querySelector("#resume-additional")?.value || "";
  for (const section of Object.keys(resumeSections)) resume[section] = [...form.querySelectorAll(`[data-resume-row="${section}"]`)].map(row => Object.fromEntries(resumeSections[section].fields.map(([key]) => [key, row.querySelector(`[data-resume-field="${key}"]`)?.value || ""]))).filter(row => Object.values(row).some(value => value.trim()));
  return resume;
}
function updateResumePreview(form) {
  const preview = form.querySelector("#resume-preview-content");
  if (preview && form.querySelector(".resume-preview")?.open) preview.innerHTML = renderResume(collectResume(form));
}
function entryForm(kind, item = {}) {
  if (kind === "resume") return resumeForm(item);
  const label = names[kind];
  const showBody = kind !== "link";
  const showUrl = ["link", "project", "resume"].includes(kind);
  const showImage = ["article", "project"].includes(kind);
  return `<form id="entry-form" class="form-panel" data-kind="${kind}" data-id="${attr(item.id || "")}"><h2>${item.id ? "编辑" : "新建"}${label}</h2>
    <div class="form-grid">
      <div class="field wide"><label for="entry-title">标题</label><input id="entry-title" name="title" maxlength="180" required value="${attr(item.title)}"></div>
      <div class="field wide"><label for="entry-summary">摘要 / 简短描述</label><textarea id="entry-summary" name="summary">${esc(item.summary)}</textarea></div>
      ${showBody ? markdownEditor("entry-body", "正文", item.body, ["project", "resume", "task", "idea", "review"].includes(kind) ? "private" : "public") : ""}
      <div class="field"><label for="entry-category">分类</label><input id="entry-category" name="category" value="${attr(item.category)}" placeholder="可留空"></div>
      <div class="field"><label for="entry-order">排序（数字越小越靠前）</label><input id="entry-order" name="sort_order" type="number" value="${attr(item.sort_order ?? 0)}"></div>
      ${showUrl ? `<div class="field wide"><label for="entry-url">外部链接</label><input id="entry-url" name="url" type="url" value="${attr(item.url)}" placeholder="https://"></div>` : ""}
      ${showImage ? `<div class="field wide"><label for="entry-image">图片地址</label><input id="entry-image" name="image_url" value="${attr(item.image_url)}" placeholder="/media/public/..."></div>
        <div class="field wide"><label>上传图片</label><div class="upload-box"><input type="file" id="entry-file" accept="image/jpeg,image/png,image/webp,image/gif"><button type="button" class="secondary" data-upload="entry">上传并使用</button></div></div>` : ""}
      <div class="field"><label for="entry-status">状态</label><select id="entry-status" name="status">
        ${[["draft","草稿"],["published",kind === "task" ? "进行中" : "已发布"],["done","已完成"]].map(([value,text]) => `<option value="${value}" ${(item.status || "draft") === value ? "selected" : ""}>${text}</option>`).join("")}
      </select></div>
    </div><div class="actions"><button class="primary">保存${label}</button><button class="secondary" type="button" data-cancel-edit="1">取消</button><span id="admin-feedback" class="feedback" role="status"></span></div></form>`;
}
function entriesPage(kind) {
  const label = names[kind];
  const editing = state.editId === "new" ? {} : state.rows.find(row => row.id === state.editId);
  return `<div class="admin-head"><div><h1>${label}管理</h1><p>${kind === "task" || kind === "idea" || kind === "review" ? "这些内容仅在后台显示。" : kind === "project" || kind === "resume" ? "只有获得访问权限的访客才能查看已发布内容。" : "草稿不会出现在公开网站。"}</p></div><button class="primary" data-new-entry="${kind}">＋ 新建${label}</button></div>
    ${state.rows.length ? `<div class="admin-table"><div class="admin-row"><span>标题</span><span>${kind === "resume" ? "职业方向" : "分类"}</span><span>状态</span><span>操作</span></div>
      ${state.rows.map(row => `<div class="admin-row"><strong title="${attr(row.title)}">${esc(row.title)}</strong><span class="muted">${esc(kind === "resume" ? parseResume(row.body).headline || "—" : row.category || "—")}</span><span class="pill">${({ draft:"草稿",published:"已发布",done:"已完成" })[row.status] || esc(row.status)}</span><span class="row-actions"><button class="text-button" data-edit-entry="${attr(row.id)}">编辑</button><button class="text-button delete" data-delete-entry="${attr(row.id)}">删除</button></span></div>`).join("")}</div>` : '<div class="empty">这里还没有内容。点击右上角新建。</div>'}
    ${state.editId ? entryForm(kind, editing || {}) : ""}`;
}
function renderAdmin() {
  let content;
  if (state.adminPage === "overview") content = adminOverview();
  else if (state.adminPage === "site") content = siteForm();
  else if (state.adminPage === "access") content = accessForm();
  else content = entriesPage(state.adminPage);
  app.innerHTML = adminFrame(content);
}
async function loadAdminRows(kind) {
  state.rows = await api(`/api/admin/entries/${kind}`);
  renderAdmin();
}
async function initAdmin() {
  try {
    const data = await api("/api/admin/bootstrap");
    state.site = data.site;
    state.accessConfigured = data.accessConfigured;
    renderAdmin();
  } catch (cause) {
    if (cause.status === 401) renderAdminLogin();
    else app.innerHTML = `<div class="shell"><div class="section-card panel"><h2>无法进入管理工作台</h2><p>${esc(cause.message)}</p></div></div>`;
  }
}
function renderAdminLogin() {
  app.innerHTML = `<div class="shell"><header class="topbar"><a class="brand" href="/">${brand()}</a></header>
    <main class="admin-login panel"><h1>登录后台</h1><p class="muted">使用部署时配置的管理员账号登录。</p>
    <form id="admin-login-form"><div class="field"><label for="admin-username">用户名</label><input id="admin-username" name="username" autocomplete="username" required autofocus></div>
    <div class="field"><label for="admin-password">密码</label><input id="admin-password" name="password" type="password" autocomplete="current-password" required></div>
    <button class="primary" type="submit">登录</button><p id="admin-feedback" class="feedback error" role="alert"></p></form></main></div>`;
}
function feedback(message, isError = false, modal = false) {
  const node = document.querySelector(modal ? "#modal-feedback" : "#admin-feedback");
  if (node) { node.textContent = message; node.classList.toggle("error", isError); }
}
async function upload(inputId, targetId, scope = "public") {
  const file = document.getElementById(inputId)?.files?.[0];
  if (!file) throw new Error("请先选择图片");
  const form = new FormData();
  form.append("file", file);
  form.append("scope", scope);
  const result = await api("/api/admin/media", { method: "POST", body: form });
  document.getElementById(targetId).value = result.url;
  feedback("图片已上传，记得保存表单。");
}
function insertMarkdown(textarea, action, replacement = "") {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const snippets = {
    heading: `## ${selected || "标题"}`,
    bold: `**${selected || "加粗文字"}**`,
    italic: `*${selected || "斜体文字"}*`,
    link: `[${selected || "链接文字"}](https://example.com)`,
    quote: `> ${selected || "引用内容"}`,
    list: selected ? selected.split("\n").map(line => `- ${line}`).join("\n") : "- 列表项",
    code: selected.includes("\n") ? `\n\`\`\`\n${selected}\n\`\`\`\n` : `\`${selected || "代码"}\``,
    image: replacement
  };
  const value = snippets[action];
  if (value === undefined) return;
  textarea.setRangeText(value, start, end, "select");
  textarea.focus();
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
document.addEventListener("input", event => {
  if (event.target.matches(".markdown-editor textarea")) {
    const preview = event.target.closest(".markdown-editor")?.querySelector(".editor-preview");
    if (preview) preview.innerHTML = event.target.value ? renderMarkdown(event.target.value) : '<p class="muted">预览会在这里显示</p>';
  }
  const form = event.target.closest(".resume-form");
  if (form) updateResumePreview(form);
});
document.addEventListener("change", async event => {
  if (!event.target.matches(".editor-image-file")) return;
  const input = event.target;
  const editor = input.closest(".markdown-editor");
  const textarea = editor?.querySelector("textarea");
  const file = input.files?.[0];
  if (!textarea || !file) return;
  const position = textarea.selectionStart;
  try {
    const form = new FormData();
    form.append("file", file);
    form.append("scope", editor.dataset.uploadScope);
    feedback("图片上传中…");
    const { url } = await api("/api/admin/media", { method: "POST", body: form });
    textarea.setSelectionRange(position, position);
    insertMarkdown(textarea, "image", `![图片](${url})`);
    feedback("图片已插入正文，保存表单后生效。");
  } catch (cause) { feedback(cause.message, true); }
  finally { input.value = ""; }
});
document.addEventListener("click", async event => {
  const target = event.target.closest("[data-page],[data-tab],[data-category],[data-detail],[data-unlock],[data-close-modal],[data-back],[data-back-about],[data-admin-page],[data-admin-logout],[data-new-entry],[data-edit-entry],[data-delete-entry],[data-cancel-edit],[data-upload],[data-editor-action],[data-add-social],[data-remove-social],[data-resume-add],[data-resume-remove],[data-resume-preview]");
  if (!target) return;
  try {
    if (target.dataset.resumeAdd) {
      const form = target.closest(".resume-form");
      form.querySelector(`[data-resume-list="${target.dataset.resumeAdd}"]`)?.insertAdjacentHTML("beforeend", resumeRow(target.dataset.resumeAdd));
      updateResumePreview(form);
    }
    else if (target.dataset.resumeRemove) {
      const form = target.closest(".resume-form");
      target.closest("[data-resume-row]")?.remove();
      updateResumePreview(form);
    }
    else if (target.dataset.resumePreview) {
      const form = target.closest(".resume-form");
      form.querySelector("#resume-preview-content").innerHTML = renderResume(collectResume(form));
    }
    else if (target.dataset.addSocial) document.querySelector("#social-link-list")?.insertAdjacentHTML("beforeend", socialLinkRow());
    else if (target.dataset.removeSocial) target.closest("[data-social-row]")?.remove();
    else if (target.dataset.editorAction) {
      const editor = target.closest(".markdown-editor");
      if (target.dataset.editorAction === "image") editor.querySelector(".editor-image-file").click();
      else insertMarkdown(editor.querySelector("textarea"), target.dataset.editorAction);
    } else if (target.dataset.page) {
      state.page = target.dataset.page; state.detail = null; state.category = "全部";
      location.hash = state.page; renderPublic();
    } else if (target.dataset.tab) {
      state.tab = target.dataset.tab; state.detail = null; history.replaceState(null, "", `#about/${state.tab}`); renderPublic();
      if (state.tab !== "bio" && !state.unlocked && state.protected) { state.modal = "unlock"; renderPublic(); }
    } else if (target.dataset.category) {
      state.category = target.dataset.category; state.page = "articles"; location.hash = "articles"; renderPublic();
    } else if (target.dataset.detail) {
      const [kind, id] = target.dataset.detail.split(":");
      state.detail = await api(`/api/public/entries/${kind}/${id}`);
      if (kind === "article") state.page = "articles";
      else { state.page = "about"; state.tab = kind === "project" ? "projects" : "resume"; }
      history.replaceState(null, "", `#${kind}/${id}`);
      renderPublic();
    } else if (target.dataset.unlock) { state.modal = "unlock"; renderPublic(); }
    else if (target.dataset.closeModal) { state.modal = null; renderPublic(); }
    else if (target.dataset.back) { state.detail = null; history.replaceState(null, "", "#articles"); renderPublic(); }
    else if (target.dataset.backAbout) { state.detail = null; history.replaceState(null, "", `#about/${state.tab}`); renderPublic(); }
    else if (target.dataset.adminLogout) {
      await api("/api/admin/logout", { method: "POST" });
      state.site = null; state.rows = []; state.adminPage = "overview"; renderAdminLogin();
    }
    else if (target.dataset.adminPage) {
      state.adminPage = target.dataset.adminPage; state.editId = null; state.rows = []; renderAdmin();
      if (names[state.adminPage]) await loadAdminRows(state.adminPage);
    } else if (target.dataset.newEntry) { state.editId = "new"; renderAdmin(); }
    else if (target.dataset.editEntry) { state.editId = target.dataset.editEntry; renderAdmin(); }
    else if (target.dataset.cancelEdit) { state.editId = null; renderAdmin(); }
    else if (target.dataset.deleteEntry) {
      if (!confirm("确定删除这条内容吗？此操作无法撤销。")) return;
      await api(`/api/admin/entries/${state.adminPage}/${target.dataset.deleteEntry}`, { method: "DELETE" });
      await loadAdminRows(state.adminPage);
    } else if (target.dataset.upload) {
      const type = target.dataset.upload;
      await upload(type === "entry" ? "entry-file" : `${type}-file`, type === "entry" ? "entry-image" : `${type}Url`, type === "entry" && ["project","resume"].includes(state.adminPage) ? "private" : "public");
    }
  } catch (cause) { feedback(cause.message, true); if (!isAdmin) alert(cause.message); }
});
document.addEventListener("submit", async event => {
  const form = event.target;
  if (!["site-form","access-form","entry-form","unlock-form","admin-login-form"].includes(form.id)) return;
  event.preventDefault();
  try {
    if (form.id === "admin-login-form") {
      await api("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: form.elements.namedItem("username").value, password: form.elements.namedItem("password").value }) });
      await initAdmin(); return;
    }
    if (form.id === "unlock-form") {
      await api("/api/public/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: form.elements.namedItem("password").value }) });
      state.unlocked = true; state.modal = null;
      if (state.pendingDetail) {
        const { kind, id } = state.pendingDetail;
        state.detail = await api(`/api/public/entries/${kind}/${encodeURIComponent(id)}`).catch(() => null);
        state.pendingDetail = null;
      }
      renderPublic(); return;
    }
    if (form.id === "site-form") {
      const data = Object.fromEntries(new FormData(form));
      data.socialLinks = [...form.querySelectorAll("[data-social-row]")].map(row => ({ platform: row.querySelector("[data-social-platform]").value, label: row.querySelector("[data-social-label]").value, url: row.querySelector("[data-social-url]").value }));
      data.navigation = (state.site.navigation || []).map(item => ({ key: item.key, label: form.querySelector(`[data-nav-label="${item.key}"]`)?.value || item.label, visible: form.querySelector(`[data-nav-visible="${item.key}"]`)?.checked ?? true }));
      data.aboutTabs = (state.site.aboutTabs || []).map(item => ({ key: item.key, label: form.querySelector(`[data-tab-label="${item.key}"]`)?.value || item.label }));
      state.site = await api("/api/admin/site", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      renderAdmin(); feedback("站点资料已保存。"); return;
    }
    if (form.id === "access-form") {
      await api("/api/admin/access", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: form.elements.namedItem("password").value }) });
      state.accessConfigured = true; renderAdmin(); feedback("访问密码已保存。"); return;
    }
    if (form.id === "entry-form") {
      const kind = form.dataset.kind;
      const data = Object.fromEntries(new FormData(form));
      if (kind === "resume") {
        const resume = validateResume(collectResume(form));
        data.body = serializeResume(resume);
        data.title = data.title?.trim() || resume.name;
        data.summary = (resume.headline || plainMarkdown(resume.summary)).slice(0, 1000);
        data.category = "";
        data.url = "";
        data.image_url = "";
      }
      const id = form.dataset.id;
      await api(`/api/admin/entries/${kind}${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
      state.editId = null;
      await loadAdminRows(kind);
      const head = document.querySelector(".admin-head");
      if (head) { const msg = document.createElement("p"); msg.className = "feedback"; msg.textContent = "内容已保存。"; head.append(msg); }
    }
  } catch (cause) { feedback(cause.message, true, form.id === "unlock-form"); }
});
window.addEventListener("hashchange", async () => {
  if (isAdmin) return;
  if (state.site) { await applyRouteFromHash(); renderPublic(); }
});
isAdmin ? initAdmin() : initPublic();
