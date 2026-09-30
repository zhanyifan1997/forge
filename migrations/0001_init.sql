CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS entries (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('article','project','resume','link','task','idea','review')),
  title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_entries_kind_status_order ON entries(kind, status, sort_order, updated_at);

CREATE TABLE IF NOT EXISTS unlock_attempts (
  client_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
('site', '{"name":"Neuralperch","tagline":"","description":"","avatarUrl":"","coverUrl":"","announcement":"","contactEmail":"","navigation":[{"key":"home","label":"首页","visible":true},{"key":"articles","label":"文章","visible":true},{"key":"links","label":"常用链接","visible":true},{"key":"about","label":"关于","visible":true}],"aboutTabs":[{"key":"bio","label":"关于我"},{"key":"projects","label":"项目"},{"key":"resume","label":"简历"}]}');
