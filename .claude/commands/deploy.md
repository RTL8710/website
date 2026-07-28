---
description: 提交推送(触发两处自动部署:GitHub Pages + 自建服务器 anhaishi.cn),验证线上
allowed-tools: Bash
---

把当前网站改动推到分支,**push 会自动触发两个 workflow 部署两处**,无需手动 SSH:
- `deploy.yml`（Deploy to GitHub Pages）→ https://rtl8710.github.io/website/(海外备份)
- `deploy-server.yml`（Deploy to Server)→ 自动 SSH 到自建服务器 `194.60.95.26` 做 `git reset --hard`(只更新 `/var/www/website` 静态文件,**不碰 nginx/SSL**)→ https://anhaishi.cn(主站)。用仓库 Secrets(SERVER_HOST/PORT/USER/PASSWORD)。

工作目录:`/Users/jinhuilv/source/flutter/ahstools/docs/website`

步骤:
1. `git status --short` 看有无改动。
   - 无改动:告知「无待部署改动」并停止;除非用户明确要求强制重跑,才用 `git commit --allow-empty` 重新触发。
2. `git add -A`,commit:
   - 消息:传了 `$ARGUMENTS` 就用它;没传就读 `git diff --staged --stat` 概括一句**中文**消息。
   - **不要**加 `Co-Authored-By`(项目规则)。
3. 推前同步远端:`git fetch origin` → `git rebase origin/claude/website-auto-deploy-vnolom`;有冲突就停下报告,不强推。
4. `git push`。
5. 等两个 workflow 跑完(轮询 GitHub API,无需 gh):
   ```
   curl -s "https://api.github.com/repos/RTL8710/website/actions/runs?per_page=8" | python3 -c "import sys,json;[print(r['name'],r['status'],r.get('conclusion')) for r in json.load(sys.stdin)['workflow_runs'] if r['head_sha'].startswith('<本次commit前7位>')]"
   ```
   - 关注 **Deploy to GitHub Pages** 和 **Deploy to Server** 两个都 `completed / success`。
   - Deploy to Server 若 `failure`:多半是 `SERVER_PASSWORD` secret 与服务器实际密码不符(命令本身已验证可用),提示用户去 Settings→Secrets 更新;不要改用 cron。
6. 验证两处线上(可能有几十秒 CDN/缓存,`000` 多为瞬时超时,重测 2-3 次):
   - `curl -sI https://rtl8710.github.io/website/ | head -1` → 200
   - `curl -sI https://anhaishi.cn/ | head -1` → 200
   - 若改动可探测,再 `curl -s https://anhaishi.cn/<改的页> | grep <标志>` 确认新内容。
   - 都通过报告「✅ 已部署:Pages + anhaishi.cn 均已自动更新」。
