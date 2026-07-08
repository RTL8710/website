#!/usr/bin/env bash
# 一键部署/更新本站到 Linux 服务器(Ubuntu/Debian/CentOS)。幂等可重跑。
# 若服务器已有 Let's Encrypt 证书(/etc/letsencrypt/live/<域名>),自动配 80→443 HTTPS,
# 不会破坏已有 SSL;没有证书时退回纯 HTTP 监听 PORT。
# 用法(在服务器上,root 执行):
#   curl -fsSL https://raw.githubusercontent.com/RTL8710/website/claude/website-auto-deploy-vnolom/deploy/server-install.sh | bash
# 可选环境变量:
#   DOMAIN=anhaishi.cn  主域名(匹配已有证书 + server_name;默认 anhaishi.cn)
#   PORT=80             无证书时的 HTTP 监听端口(默认 80)
#   BRANCH=...          部署分支(默认 claude/website-auto-deploy-vnolom)
set -euo pipefail

REPO="https://github.com/RTL8710/website.git"
BRANCH="${BRANCH:-claude/website-auto-deploy-vnolom}"
WEBROOT="/var/www/website"
PORT="${PORT:-80}"
DOMAIN="${DOMAIN:-anhaishi.cn}"

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
git config --global --add safe.directory "$WEBROOT" 2>/dev/null || true
if [ -d "$WEBROOT/.git" ]; then
  git -C "$WEBROOT" fetch --depth 1 origin "$BRANCH"
  git -C "$WEBROOT" reset --hard "origin/$BRANCH"
else
  rm -rf "$WEBROOT"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$WEBROOT"
fi

echo "==> [3/6] 写 nginx 站点配置"
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
mkdir -p /etc/nginx/conf.d

# 检测该域名是否已有 Let's Encrypt 证书
CERT_DIR=""
for d in "$DOMAIN" "www.$DOMAIN"; do
  if [ -d "/etc/letsencrypt/live/$d" ]; then CERT_DIR="/etc/letsencrypt/live/$d"; break; fi
done

if [ -n "$CERT_DIR" ]; then
  echo "   检测到证书 $CERT_DIR → 配置 80→443 跳转 + HTTPS(保留 SSL)"
  cat > /etc/nginx/conf.d/website.conf <<EONG
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${DOMAIN} www.${DOMAIN};
    location /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl default_server;
    listen [::]:443 ssl default_server;
    server_name ${DOMAIN} www.${DOMAIN};
    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    root ${WEBROOT};
    index index.html;
    location / { try_files \$uri \$uri/ =404; }
    client_max_body_size 200m;
    gzip on; gzip_min_length 1024;
    gzip_types text/css application/javascript application/json image/svg+xml;
    location ~* \.(?:mp4|webm|jpg|jpeg|png|gif|webp|svg|ico|woff2?)\$ { expires 7d; add_header Cache-Control "public"; }
}
EONG
else
  echo "   未检测到证书 → 纯 HTTP 监听 ${PORT}(域名 HTTPS 请先跑 ubuntu-setup.sh)"
  # 若 nginx 自带 server 占用 80,挪走以免冲突
  if [ -f /etc/nginx/nginx.conf ]; then
    sed -i -E 's/listen[[:space:]]+(\[::\]:)?80[[:space:]]+default_server;/listen \18080;/g' /etc/nginx/nginx.conf || true
  fi
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
fi

echo "==> [4/6] 放行防火墙端口(80 / 443 / ${PORT})"
for p in 80 443 "$PORT"; do
  command -v ufw >/dev/null 2>&1 && ufw allow "${p}/tcp" >/dev/null 2>&1 || true
  command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --permanent --add-port="${p}/tcp" >/dev/null 2>&1 || true
done
command -v firewall-cmd >/dev/null 2>&1 && firewall-cmd --reload >/dev/null 2>&1 || true

echo "==> [5/6] 校验并启动 nginx"
nginx -t
systemctl enable nginx >/dev/null 2>&1 || true
systemctl restart nginx

echo "==> [6/6] 本机自测"
sleep 1
if [ -n "$CERT_DIR" ]; then
  https_code="$(curl -sk -o /dev/null -w '%{http_code}' "https://127.0.0.1/" || true)"
  echo "本机 https://127.0.0.1/ 返回 HTTP ${https_code}"
  if [ "$https_code" = "200" ]; then
    echo "✅ 部署成功!访问 https://${DOMAIN}/ (若打不开,去云服务商安全组放行 80/443)"
  else
    echo "⚠️ HTTPS 未返回 200,请检查上面的日志。"
  fi
else
  code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PORT}/" || true)"
  echo "本机访问 http://127.0.0.1:${PORT}/ 返回 HTTP ${code}"
  if [ "$code" = "200" ]; then
    echo "✅ 部署成功!外网访问 http://<你的服务器IP>:${PORT}/ (若打不开,去云服务商安全组放行 ${PORT} 端口)"
  else
    echo "⚠️ 未返回 200,请检查上面的日志。"
  fi
fi
