# Neuralperch

一个部署在 Cloudflare Workers 上的个人站。前台展示文章、链接与关于页面；项目和简历在「关于」的 Tab 中，访问时需要密码。后台可编辑站点名称、头像、封面、简介、公告、导航文字、文章、项目、简历、链接、待办、想法和每周回顾。待办、想法、回顾只在后台显示。

## 技术与数据

- Workers Static Assets 托管前端，Worker 处理 `/api/*`。
- D1 保存站点资料、内容条目、访问密码摘要和尝试次数。
- R2 保存上传的图片；也可以在后台填写 HTTPS 图片地址。
- Cloudflare Access 保护 `/admin/*` 与 `/api/admin/*`；Worker 还会验证 Access JWT。
- 项目和简历只由服务端在密码验证通过后返回。访问密码不会明文存储，修改密码会使旧的解锁状态失效。

站点内容都存在 D1 或 R2，代码中的中文只用于表单标签、空状态和新站点的初始值。

## 本地运行

需要 Node.js 20+。

```sh
npm install
cp .dev.vars.example .dev.vars
npm run db:local
npm run dev
```

访问 `http://localhost:8787/` 和 `http://localhost:8787/admin/`。本地 `.dev.vars` 开启仅限 localhost 的管理员绕过，供开发使用。不要把它提交到仓库。

## 部署到 Cloudflare

仓库中的 `wrangler.local.jsonc` **只用于本地开发**。线上配置由 `scripts/cloudflare.mjs` 在运行部署命令时从环境变量生成，命令结束后会删除。部署不需要修改任何项目文件。

先在 Cloudflare 创建 D1 数据库、R2 桶，以及保护 `SITE_DOMAIN/admin/*` 和 `SITE_DOMAIN/api/admin/*` 的同一个 Access 应用。数据库与桶名也可直接来自环境变量：`npx wrangler d1 create "$D1_DATABASE_NAME"`、`npx wrangler r2 bucket create "$R2_BUCKET_NAME"`。把 D1 创建命令返回的 UUID 存为 `D1_DATABASE_ID` 环境变量。Access 只允许你的身份访问；两条路径使用同一个应用 AUD。资源只需创建一次。

| 环境变量 | 用途 |
| --- | --- |
| `D1_DATABASE_ID` | D1 数据库 UUID |
| `D1_DATABASE_NAME` | D1 数据库名称 |
| `R2_BUCKET_NAME` | R2 桶名 |
| `ACCESS_TEAM_DOMAIN` | Access 团队域名，例如 `team.cloudflareaccess.com` |
| `ACCESS_AUD` | 上述 Access 应用的 AUD |
| `SITE_DOMAIN` | 要绑定的自定义域名，例如 `neuralperch.com` |
| `SESSION_SECRET` | 至少 32 字符的随机密钥，作为 Worker Secret 上传 |
| `WORKER_NAME` | 可选，默认 `neuralperch` |

本地登录 Wrangler 后，或在 CI 中设置 `CLOUDFLARE_ACCOUNT_ID`、`CLOUDFLARE_API_TOKEN`，运行：

```sh
npm run deploy:check  # 检查变量并在本地模拟打包
npm run db:remote     # 将迁移应用到环境变量指定的 D1
npm run deploy        # 上传代码、资源绑定、普通变量及 SESSION_SECRET
```

`npm run deploy` 会根据 `SITE_DOMAIN` 配置 Worker 自定义域名。`SESSION_SECRET` 仅写入权限为 0600 的临时文件供 Wrangler 的 `--secrets-file` 使用，命令结束即删除；不要把它放进仓库。缺少任何必要变量时命令会在部署前报错。首次部署前先完成 Access 应用设置；未配置 Access 时 Worker 会拒绝后台请求。

## 备份

D1 内容可以在 Cloudflare 控制台导出。R2 图片需要单独备份。删除或更换 R2 对象前，先确认相关内容不再引用它。

## 检查

```sh
npm test
node --check src/worker.js
node --check public/app.js
```
