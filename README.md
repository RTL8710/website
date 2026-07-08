# 深圳市安海视科技 · 云边端 AI 视觉官网

设备端 AI 视觉解决方案的展示官网（8 页，中英双语，纯静态）。**一套代码，两处部署。**

## 🌐 在线地址

- **自有域名（服务器）**：https://www.anhaishi.cn
- **GitHub Pages（海外备份）**：https://rtl8710.github.io/website/

## 📄 页面

| 文件 | 说明 |
|------|------|
| `index.html` | 门户首页 |
| `solution-overview.html` | 解决方案总览 |
| `cases.html` | 实战案例 |
| `product-manual.html` / `app-manual.html` | Web / App 说明书 |
| `product-onepager.html` | 产品一页纸 |
| `cooperation-invite.html` | 合作邀约 |
| `demos.html` | 功能演示（19 段真机录屏）|
| `marketing/` | 素材源：截图 / 视频 / PDF / 文案 |

---

## 🚀 部署方式一：GitHub Pages（自动）

推送到分支后，`.github/workflows/deploy.yml` 自动构建并发布。零维护。

## 🚀 部署方式二：自有 Ubuntu 服务器（一键脚本）

全新服务器一条命令，完成 nginx 安装 → 拉取网站 → HTTPS 证书 → 自动续期：

```bash
curl -fsSL https://raw.githubusercontent.com/RTL8710/website/claude/website-auto-deploy-vnolom/deploy/ubuntu-setup.sh \
  | DOMAIN=anhaishi.cn EMAIL=493148469@qq.com bash
```

**跑之前确保 3 个前置：**
1. **DNS**：`anhaishi.cn` 和 `www.anhaishi.cn` 的 A 记录都指向服务器公网 IP
2. **云安全组**放行 **80 + 443** 端口
3. **80 端口空闲**（若 x-ui 等占用 80，先把它改到别的端口）

脚本特性：幂等可重跑、只对已解析的域名签证书、内置 ACME 续期防坑、certbot 自动续期（证书永不过期）。

### 更新网站内容（服务器）
```bash
cd /var/www/website && git pull
```

### 卸载 / 重置（服务器）
```bash
curl -fsSL https://raw.githubusercontent.com/RTL8710/website/claude/website-auto-deploy-vnolom/deploy/uninstall.sh \
  | DOMAIN=anhaishi.cn bash
```
只清本站的 nginx 配置 / 证书 / 文件，不动 nginx 本体和 x-ui 等其它服务。

---

## 🔐 HTTPS 证书

- Let's Encrypt，有效期 90 天
- `certbot.timer` 已配置**自动续期**（到期前 30 天自动续），无需手动
- 手动验证续期：`certbot renew --dry-run`
- ⚠️ 续期需 **80 端口可访问**；配 nginx 时别用整站 `return 301` 把 `/.well-known/acme-challenge/` 挡掉（`ubuntu-setup.sh` 已处理好）

## 🗂️ deploy/ 目录

| 脚本 | 用途 |
|------|------|
| `ubuntu-setup.sh` | **一键完整部署**（nginx + 网站 + HTTPS）|
| `server-install.sh` | 部署/更新：跑 80；**若已有证书则自动配 80→443 HTTPS(不破坏 SSL)**，无证书才纯 HTTP。首次签证书仍用 `ubuntu-setup.sh` |
| `uninstall.sh` | 卸载 / 重置 |
