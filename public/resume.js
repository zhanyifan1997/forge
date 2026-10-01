const prefix = "NP_RESUME_V1\n";
const sections = {
  experience: ["organization", "role", "period", "location", "description"],
  education: ["school", "degree", "period", "description"],
  projects: ["name", "role", "period", "url", "description"],
  skills: ["category", "items"]
};

export function blankResume() {
  return { name: "", headline: "", email: "", phone: "", location: "", website: "", summary: "", experience: [], education: [], projects: [], skills: [], additional: "" };
}

export function parseResume(body) {
  const source = String(body || "");
  if (!source.startsWith(prefix)) return blankResume();
  try {
    const data = JSON.parse(source.slice(prefix.length));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid resume");
    const result = blankResume();
    for (const key of ["name", "headline", "email", "phone", "location", "website", "summary", "additional"]) result[key] = String(data[key] || "");
    for (const [key, fields] of Object.entries(sections)) result[key] = Array.isArray(data[key]) ? data[key].map(row => Object.fromEntries(fields.map(field => [field, String(row?.[field] || "")]))) : [];
    return result;
  } catch { return blankResume(); }
}

export function serializeResume(data) {
  return prefix + JSON.stringify(data);
}

export function validateResume(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("简历资料格式无效");
  const result = blankResume();
  const limits = { name: 100, headline: 160, email: 200, phone: 80, location: 160, website: 500, summary: 4000, additional: 20000 };
  for (const [key, max] of Object.entries(limits)) {
    const value = String(data[key] ?? "").trim();
    if (value.length > max) throw new Error("简历内容过长");
    result[key] = value;
  }
  if (!result.name) throw new Error("请填写简历姓名");
  if (result.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) throw new Error("简历邮箱格式无效");
  if (result.website && !/^https:\/\/[^\s]+$/i.test(result.website)) throw new Error("个人网站需使用 HTTPS 地址");
  for (const [key, fields] of Object.entries(sections)) {
    if (!Array.isArray(data[key]) || data[key].length > 20) throw new Error("简历条目数量无效");
    result[key] = data[key].map(row => {
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("简历条目格式无效");
      const clean = {};
      for (const field of fields) {
        const value = String(row[field] ?? "").trim();
        if (value.length > (field === "description" ? 4000 : field === "items" ? 1000 : 500)) throw new Error("简历条目内容过长");
        clean[field] = value;
      }
      const required = { experience: "organization", education: "school", projects: "name", skills: "category" }[key];
      if (!clean[required]) throw new Error(`请填写${{ experience: "工作单位", education: "学校", projects: "项目名称", skills: "技能类别" }[key]}`);
      if (key === "projects" && clean.url && !/^https:\/\/[^\s]+$/i.test(clean.url)) throw new Error("项目链接需使用 HTTPS 地址");
      return clean;
    });
  }
  return result;
}

export function isStructuredResume(body) {
  return String(body || "").startsWith(prefix);
}
