---
description: 本地起静态预览服务器,秒看网页改动(不用推 GitHub)
allowed-tools: Bash
---

在网站目录 `/Users/jinhuilv/source/flutter/ahstools/docs/website` 启动本地静态预览服务器,让用户改完 HTML 存盘后刷新浏览器即可看效果,不必推 GitHub 等 Actions。

参数 `$ARGUMENTS`:
- 空 → 启动预览服务器
- `stop` → 停掉正在后台运行的预览服务器

启动流程:
1. 依次探测端口 8000 → 8001 → 8002,选第一个空闲的(`lsof -i:<port>` 无输出即空闲)。
2. 用 `python3 -m http.server <port>` 在**后台**启动(Bash run_in_background),工作目录 = 网站根目录。
3. 启动后把常用页面地址列给用户:
   - 首页    http://localhost:<port>/index.html
   - 方案    http://localhost:<port>/solution-overview.html
   - 案例    http://localhost:<port>/cases.html
   - 演示    http://localhost:<port>/demos.html
   - 合作    http://localhost:<port>/cooperation-invite.html
   - 一页纸  http://localhost:<port>/product-onepager.html
   - 产品手册 http://localhost:<port>/product-manual.html
   - App手册  http://localhost:<port>/app-manual.html
4. 提醒:改完存盘刷新浏览器即可;`/preview stop` 结束。

停止流程(`stop`):找到并杀掉后台的 `python3 -m http.server` 进程,确认端口已释放,告知用户已停止。
