#!/usr/bin/env bash
# 服务器初始化脚本(幂等,可重复执行)
# 由 GitHub Actions 通过 SSH 远程执行:安装 nginx、建站点目录、写 nginx 配置并重载。
# 注意:服务器 80 端口已被其它服务占用,本站点监听 8080,避免冲突。
set -euo pipefail

WEBROOT="/var/www/website"
WEBPORT="8080"

echo "==> 检查并安装 nginx / rsync"
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y nginx rsync
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y nginx rsync
elif command -v yum >/dev/null 2>&1; then
  yum install -y epel-release || true
  yum install -y nginx rsync
else
  echo "!! 未识别的包管理器,请手动安装 nginx 和 rsync" >&2
  exit 1
fi

echo "==> 创建站点目录 $WEBROOT"
mkdir -p "$WEBROOT"

echo "==> 让 nginx 不占用 80 端口(80 已被其它服务使用)"
# 1) Debian/Ubuntu:删除会监听 80 的默认站点
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
# 2) CentOS/RHEL:主配置内置了 listen 80 的 server,把它挪到 8080(去掉 default_server 交给我们的站点)
if [ -f /etc/nginx/nginx.conf ]; then
  sed -i -E 's/listen[[:space:]]+(\[::\]:)?80[[:space:]]+default_server;/listen \18080;/g; s/listen[[:space:]]+(\[::\]:)?80;/listen \18080;/g' /etc/nginx/nginx.conf || true
fi

echo "==> 写入 nginx 站点配置(监听 ${WEBPORT})"
mkdir -p /etc/nginx/conf.d
cat > /etc/nginx/conf.d/website.conf <<EONG
server {
    listen ${WEBPORT} default_server;
    listen [::]:${WEBPORT} default_server;
    server_name _;

    root ${WEBROOT};
    index index.html;

    location / {
        try_files \$uri \$uri/ =404;
    }

    client_max_body_size 200m;

    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    location ~* \.(?:mp4|webm|jpg|jpeg|png|gif|webp|svg|ico|woff2?)\$ {
        expires 7d;
        add_header Cache-Control "public";
    }
}
EONG

echo "==> 校验并重载 nginx"
nginx -t
systemctl enable nginx 2>/dev/null || true
systemctl restart nginx 2>/dev/null || service nginx restart || nginx -s reload || nginx

echo "==> 服务器初始化完成,站点监听 ${WEBPORT}"
