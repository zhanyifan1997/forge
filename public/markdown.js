import MarkdownIt from "./vendor/markdown-it.esm.min.mjs";

const parser = new MarkdownIt({ html: false, linkify: true, breaks: true });

export function renderMarkdown(value) {
  return parser.render(String(value ?? ""));
}
