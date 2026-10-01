# Neuralperch

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zhanyifan1997/forge)

一个部署在 Cloudflare Workers 上的个人站。前台展示文章、链接与关于页面；项目和简历在「关于」的 Tab 中，访问时需要密码。后台可编辑站点名称、头像、页面背景、头像下方的社交与联系链接、简介、公告、导航文字、文章、项目、简历、链接、待办、想法和每周回顾。待办、想法、回顾只在后台显示。前台与后台页眉使用 `public/brand/neuralperch-logo.png`，网站图标使用同套品牌头像。

## 技术与数据

- Workers Static Assets 托管前端，Worker 处理 `/api/*`。
- D1 保存站点资料、内容条目、访问密码摘要和尝试次数。
- R2 保存上传的图片；也可以在后台填写 HTTPS 图片地址。
- 文章、项目、简历、待办、想法、回顾的正文，以及「关于我」介绍支持 Markdown 编辑、实时预览和图片上传插入。发布后前台按 Markdown 展示；原始 HTML 会被转义。
- `/admin` 使用部署时配置的管理员用户名和密码登录；Worker 用带签名的 HttpOnly Cookie 保护后台接口，登录失败会限流。
- 项目和简历只由服务端在密码验证通过后返回。访问密码不会明文存储，修改密码会使旧的解锁状态失效。
- 简历使用独立的结构化表单：基本资料、工作经历、项目经历、教育经历、专业技能与补充信息，并在前台展示为简历版式；结构化数据保存在 D1 的简历正文中，无需额外迁移。

站点内容都存在 D1 或 R2，代码中的中文只用于表单标签、空状态和新站点的初始值。

## 本地运行

需要 Node.js 20+。

```sh
npm install
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev
```

先在 `.dev.vars` 填入自己的 `ADMIN_USERNAME`、至少 12 字符的 `ADMIN_PASSWORD`，以及用 `openssl rand -hex 32` 生成的 `SESSION_SECRET`。访问 `http://localhost:8787/` 和 `http://localhost:8787/admin/`。不要把 `.dev.vars` 提交到仓库。

## 一键部署到 Cloudflare

点击页面顶部的按钮。在 Cloudflare 向导中为 `DB` 选择已有 D1 或创建新的 D1，为 `MEDIA` 选择已有 R2 桶或创建新的 R2 桶；资源名称和 ID 由你的选择决定。`wrangler.jsonc` 里的资源名称只是向导的初始建议，零 UUID 是供向导替换的占位值。代码只依赖 `DB`、`MEDIA` 这两个绑定名。向导的部署命令使用 `npm run deploy`，会按最终绑定的 D1 执行迁移，再部署 Worker。默认先获得 `*.workers.dev` 地址；自定义域名可在部署后到 Cloudflare 为 Worker 添加，不需要修改代码。

向导会读取 `.dev.vars.example`，请填写 `ADMIN_USERNAME`、`ADMIN_PASSWORD` 和 `SESSION_SECRET`。密码至少 12 字符；密钥可用 `openssl rand -hex 32` 生成。它们作为 Worker Secret 注入，不写入代码或仓库。部署后直接访问 `/admin/` 登录。若此前为该路径设置过 Cloudflare Access 应用，需要停用对应规则，浏览器才能到达站内登录页。

Cloudflare 官方部署按钮要求来源仓库对访问者公开。如果 `forge` 仍是私有仓库，按钮可能无法导入；可以将代码发布到公开仓库后使用按钮，或继续使用下面的环境变量部署流程。

## 使用环境变量部署

`wrangler.local.jsonc` 只用于本地开发。原有的环境变量部署流程保留为 `npm run deploy:env`：`scripts/cloudflare.mjs` 临时生成线上配置，命令结束后删除。部署不需要修改任何项目文件。仓库根目录的 `wrangler.jsonc` 则供一键部署向导使用。

先在 Cloudflare 创建 D1 数据库和 R2 桶。数据库与桶名也可直接来自环境变量：`npx wrangler d1 create "$D1_DATABASE_NAME"`、`npx wrangler r2 bucket create "$R2_BUCKET_NAME"`。把 D1 创建命令返回的 UUID 存为 `D1_DATABASE_ID` 环境变量。资源只需创建一次。

| 环境变量 | 用途 |
| --- | --- |
| `D1_DATABASE_ID` | D1 数据库 UUID |
| `D1_DATABASE_NAME` | D1 数据库名称 |
| `R2_BUCKET_NAME` | R2 桶名 |
| `SITE_DOMAIN` | 要绑定的自定义域名，例如 `neuralperch.com` |
| `ADMIN_USERNAME` | 后台登录用户名，作为 Worker Secret 上传 |
| `ADMIN_PASSWORD` | 后台登录密码，至少 12 字符，作为 Worker Secret 上传 |
| `SESSION_SECRET` | 至少 32 字符的随机密钥，作为 Worker Secret 上传 |
| `WORKER_NAME` | 可选，默认 `neuralperch` |

本地登录 Wrangler 后，或在 CI 中设置 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`，运行：

```sh
npm run deploy:check  # 检查变量并在本地模拟打包
npm run db:remote     # 将迁移应用到环境变量指定的 D1
npm run deploy:env    # 上传代码、资源绑定和三个管理员 Secret
```

`npm run deploy:env` 会根据 `SITE_DOMAIN` 配置 Worker 自定义域名。三个管理员 Secret 仅写入权限为 0600 的临时文件供 Wrangler 的 `--secrets-file` 使用，命令结束即删除；不要把它们放进仓库。缺少任何必要变量时命令会在部署前报错。

## 备份

D1 内容可以在 Cloudflare 控制台导出。R2 图片需要单独备份。删除或更换 R2 对象前，先确认相关内容不再引用它。

## 检查

```sh
npm test
node --check src/worker.js
node --check public/app.js
```
