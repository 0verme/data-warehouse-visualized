# 部署指南 (Deployment Guide)

本项目静态资源部署在 Cloudflare Workers Static Assets 上，不依赖 Node.js 服务端运行时、Astro Cloudflare Adapter 或 Worker 服务端业务代码。

## 架构概览

```text
GitHub main
→ GitHub Actions
→ Astro build
→ dist/
→ Cloudflare Workers Static Assets
→ https://sql.sb
```

---

## GitHub Actions 持续部署

工作流文件位于 [`.github/workflows/cloudflare-deploy.yml`](../.github/workflows/cloudflare-deploy.yml)：

- **Pull Request**：执行 `npm ci`、`npm run test`、`npm run lint`、`npm run format:check` 与 `npm run build`，仅用于集成验证，不执行部署。
- **Push to `main`**：完成验证与静态资源构建 (`dist/`) 后，自动调用共享 Action `0verme/ci-workflows/.github/actions/cloudflare-worker-deploy@v1` 将产物部署至 Cloudflare Workers。
- **手动触发 (`workflow_dispatch`)**：支持在 GitHub Actions 界面手动选择分支触发生产发布。

> **提示**：生产构建默认使用正式域名 `https://sql.sb` 和根路径 `/`（不设置 `BASE_PATH`），会生成绝对 canonical 与 sitemap URL。若需部署到 GitHub Pages 等非根目录，可通过 `BASE_PATH=/repo-name/ npm run build` 进行构建；若需为其他部署域名生成绝对 canonical，可设置 `PUBLIC_SITE_URL=https://你的域名`。

---

## GitHub Secrets & Variables 配置

在 `GitHub 仓库 → Settings → Secrets and variables → Actions` 中配置以下项：

| 类型         | 名称                    | 说明                                          |
| :----------- | :---------------------- | :-------------------------------------------- |
| **Secret**   | `CLOUDFLARE_API_TOKEN`  | 具备 Workers 部署权限的 Cloudflare API Token  |
| **Variable** | `CLOUDFLARE_ACCOUNT_ID` | 目标 Cloudflare 账户 ID（防止发布至错误账户） |

> **安全注意**：切勿将 Token、Account ID 或任何生产凭证写入仓库、`wrangler.jsonc`、`package.json` 或 `.env`。PR 验证不会读取生产 Secret。

---

## Cloudflare API Token 权限配置

在 Cloudflare Dashboard 中创建 **API Token**（**不要**使用 Global API Key），权限尽量收紧至目标账户：

- `Account → Workers Scripts → Edit`（部分页面显示为 `Workers Scripts Write`）
- `Account → Account Settings → Read`

本项目只上传 Worker Static Assets，不使用 Workers Routes、KV、R2、D1、Pages 或数据库绑定，因此不应为本 workflow 额外授予这些权限。

---

## 绑定自定义域名 (`sql.sb`)

自定义域名未硬编码在 `wrangler.jsonc` 中，以避免初次绑定 DNS 与 CI 凭证耦合。

首次成功部署后，在 Cloudflare 控制台进行一次性绑定：

1. 进入 **Workers & Pages** → 选择对应 Worker。
2. 进入 **Settings** → **Domains & Routes**。
3. 点击 **Add Custom Domain**，输入 `sql.sb`。
4. `sql.sb` 必须是 Cloudflare 中已激活的 zone；Cloudflare 会自动配置对应的 DNS 记录与 SSL 证书。

绑定完成后，后续 `main` 分支自动部署只更新同一个 Worker 的静态资源。

---

## 本地验证构建与部署

在本地可以通过以下命令完成测试与构建验证：

```bash
npm ci
npm run test
npm run lint
npm run format:check
npm run build

# dry-run 验证 Wrangler 读取配置与产物（不会真正上传）：
npm run deploy -- --dry-run
```
