#!/usr/bin/env bash
# 服务器初始化脚本(幂等,可重复执行)
# 由 GitHub Actions 通过 SSH 远程执行:安装 nginx、建站点目录、写 nginx 配置并重载。
set -euo pipefail

WEBROOT="/var/www/website"

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

echo "==> 写入 nginx 站点配置"
mkdir -p /etc/nginx/conf.d
cat > /etc/nginx/conf.d/website.conf <<'EONG'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    root /var/www/website;
    index index.html;

    # 单页/多页静态站点
    location / {
        try_files $uri $uri/ =404;
    }

    # 视频/大文件直传
    client_max_body_size 200m;

    # 文本类资源压缩
    gzip on;
    gzip_comp_level 5;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;

    # 静态资源缓存(图片/视频/字体)
    location ~* \.(?:mp4|webm|jpg|jpeg|png|gif|webp|svg|ico|woff2?)$ {
        expires 7d;
        add_header Cache-Control "public";
    }
}
EONG

# 避免 Debian/Ubuntu 默认站点抢占 default_server
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

echo "==> 校验并重载 nginx"
nginx -t
systemctl enable nginx 2>/dev/null || true
systemctl restart nginx 2>/dev/null || service nginx restart || nginx -s reload || nginx

echo "==> 服务器初始化完成"
