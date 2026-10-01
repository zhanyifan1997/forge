import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";
import { createAdminToken } from "../src/security.js";
import { blankResume, parseResume, serializeResume, validateResume } from "../public/resume.js";

test("structured resume keeps sections and rejects unsafe contact links", () => {
  const resume = { ...blankResume(), name: "林一", email: "lin@example.com", experience: [{ organization: "Example", role: "工程师", period: "2022—至今", location: "上海", description: "负责产品交付" }] };
  assert.deepEqual(parseResume(serializeResume(validateResume(resume))), resume);
  assert.throws(() => validateResume({ ...resume, website: "javascript:alert(1)" }), /HTTPS/);
  assert.equal(parseResume("旧的纯文本").name, "");
});

test("resume API saves structured data and rejects plain text", async () => {
  const env = {
    ADMIN_USERNAME: "owner", ADMIN_PASSWORD: "a-strong-admin-password",
    SESSION_SECRET: "local-test-secret-with-more-than-thirty-two-characters",
    DB: { prepare: sql => ({ bind: (...values) => ({ run: async () => { if (sql.startsWith("INSERT INTO entries")) saved = values; } }) }) }
  };
  let saved;
  const cookie = `np_admin=${await createAdminToken(env)}`;
  const post = body => worker.fetch(new Request("https://neuralperch.com/api/admin/entries/resume", {
    method: "POST", headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ title: "我的简历", body, status: "draft" })
  }), env);
  const data = { ...blankResume(), name: "林一" };
  assert.equal((await post(serializeResume(data))).status, 201);
  assert.equal(parseResume(saved[4]).name, "林一");
  assert.equal((await post("纯文本简历")).status, 400);
});
