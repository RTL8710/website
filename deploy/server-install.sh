#!/usr/bin/env bash
# 一键部署本站到任意 Linux 服务器(Ubuntu/Debian/CentOS)。
# 用法(在新服务器上,root 执行):
#   curl -fsSL https://raw.githubusercontent.com/RTL8710/website/claude/website-auto-deploy-vnolom/deploy/server-install.sh | bash
# 可选环境变量:
#   PORT=8080     监听端口(默认 8080;若 80 空闲想用 80,可 PORT=80)
#   BRANCH=...    部署分支(默认 claude/website-auto-deploy-vnolom)
set -euo pipefail

REPO="https://github.com/RTL8710/website.git"
BRANCH="${BRANCH:-claude/website-auto-deploy-vnolom}"
WEBROOT="/var/www/website"
PORT="${PORT:-8080}"

echo "==> [1/6] 安装 nginx + git"
if command -v apt-get >/dev/null 2>&1; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y && apt-get install -y nginx git
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y nginx git
elif command -v yum >/dev/null 2>&1; then
  yum install -y epel-release || true
  yum install -y nginx git
else
  echo "!! 未识别的包管理器,请手动安装 nginx 和 git" >&2; exit 1
fi

echo "==> [2/6] 拉取网站到 $WEBROOT (分支 $BRANCH)"
if [ -d "$WEBROOT/.git" ]; then
  git -C "$WEBROOT" fetch --depth 1 origin "$BRANCH"
  git -C "$WEBROOT" reset --hard "origin/$BRANCH"
else
  rm -rf "$WEBROOT"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$WEBROOT"
fi

echo "==> [3/6] 写 nginx 站点配置(监听 $PORT)"
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
# 若 nginx 自带 server 占用 80,挪走以免和已占用端口冲突
if [ -f /etc/nginx/nginx.conf ]; then
  sed -i -E 's/listen[[:space:]]+(\[::\]:)?80[[:space:]]+default_server;/listen \18080;/g' /etc/nginx/nginx.conf || true
fi
mkdir -p /etc/nginx/conf.d
cat > /etc/nginx/conf.d/website.conf <<EONG
server {
    listen ${PORT} default_server;
    listen [::]:${PORT} default_server;
    server_name _;
    root ${WEBROOT};
    index index.html;
    location / { try_files \$uri \$uri/ =404; }
    client_max_body_size 200m;
    gzip on; gzip_min_length 1024;
    gzip_types text/css application/javascript image/svg+xml;
}
EONG

echo "==> [4/6] 放行防火墙端口 $PORT"
command -v ufw >/dev/null 2>&1 && ufw allow "${PORT}/tcp" >/dev/null 2>&1 || true
command -v firewall-cmd >/dev/null 2>&1 && { firewall-cmd --permanent --add-port="${PORT}/tcp" >/dev/null 2>&1 || true; firewall-cmd --reload >/dev/null 2>&1 || true; }

echo "==> [5/6] 校验并启动 nginx"
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl restart nginx

echo "==> [6/6] 本机自测"
sleep 1
code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" || true)"
echo "本机访问 http://127.0.0.1:${PORT}/ 返回 HTTP ${code}"
if [ "$code" = "200" ]; then
  echo "✅ 部署成功!外网访问 http://<你的服务器IP>:${PORT}/ (若打不开,去云服务商安全组放行 ${PORT} 端口)"
else
  echo "⚠️ 未返回 200,请检查上面的日志。"
fi
