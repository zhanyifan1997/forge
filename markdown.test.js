import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "./public/markdown.js";

test("renders published Markdown structure", () => {
  const html = renderMarkdown("# 标题\n\n- 第一项\n- 第二项\n\n![图片](/media/public/example.png)");
  assert.match(html, /<h1>标题<\/h1>/);
  assert.match(html, /<ul>/);
  assert.match(html, /<img src="\/media\/public\/example\.png" alt="图片">/);
});

test("does not execute raw HTML or unsafe links", () => {
  const html = renderMarkdown('<script>alert(1)</script>\n\n[恶意链接](javascript:alert(1))');
  assert.doesNotMatch(html, /<script|href="javascript:/i);
  assert.match(html, /&lt;script&gt;/);
});
