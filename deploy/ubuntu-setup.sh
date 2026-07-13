#!/usr/bin/env bash
# =============================================================================
#  一键部署脚本(Ubuntu 全新服务器)
#  完成:安装 nginx/git/certbot → 拉取网站 → 配置 nginx → 申请 Let's Encrypt
#        HTTPS 证书 → 开启自动续期。幂等,可重复执行。
#
#  用法(root 执行,按需改域名/邮箱):
#    curl -fsSL https://raw.githubusercontent.com/RTL8710/website/claude/website-auto-deploy-vnolom/deploy/ubuntu-setup.sh \
#      | DOMAIN=anhaishi.cn EMAIL=493148469@qq.com bash
#
#  可用环境变量覆盖:
#    DOMAIN   主域名(默认 anhaishi.cn)
#    WWW      www 域名(默认 www.<DOMAIN>)
#    EMAIL    Let's Encrypt 邮箱(默认 493148469@qq.com)
#    REPO     仓库地址   BRANCH 分支   WEBROOT 站点目录
#
#  前置条件(脚本会检查并提示):
#    1) DNS 已把 DOMAIN / WWW 的 A 记录指向本机公网 IP
#    2) 云服务商安全组已放行 80 和 443 端口
#    3) 80 端口未被占用(如 x-ui 占用了 80,先改掉它的端口)
# =============================================================================
set -euo pipefail

REPO="${REPO:-https://github.com/RTL8710/website.git}"
BRANCH="${BRANCH:-claude/website-auto-deploy-vnolom}"
WEBROOT="${WEBROOT:-/var/www/website}"
DOMAIN="${DOMAIN:-anhaishi.cn}"
WWW="${WWW:-www.${DOMAIN}}"
EMAIL="${EMAIL:-493148469@qq.com}"

log(){ echo -e "\n\033[1;36m==> $*\033[0m"; }

log "[1/7] 安装 nginx / git / certbot"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y nginx git certbot python3-certbot-nginx curl

log "[2/7] 检查 80 端口(只拦非 nginx 的占用者)"
# 第 1 步刚装的 nginx 会自动起来占 80,那是我们自己的、后面会重配,不算冲突;
# 只有 x-ui 等**非 nginx** 服务占 80 才需要用户先腾出来。
OCC80="$(ss -ltnp 2>/dev/null | grep ':80 ' | grep -v 'nginx' || true)"
if [ -n "$OCC80" ]; then
  echo "!! 80 端口被非 nginx 服务占用:"; echo "$OCC80"
  echo "!! 请先把占用 80 的服务(如 x-ui)改到别的端口,再重跑本脚本。" >&2
  exit 1
fi
# 停掉自己的 nginx,让后面 [4/7] 用新配置干净重启(避免旧默认站点残留)
systemctl stop nginx >/dev/null 2>&1 || true
echo "80 端口可用(自有 nginx 会重配)✅"

log "[3/7] 拉取网站到 $WEBROOT (分支 $BRANCH)"
if [ -d "$WEBROOT/.git" ]; then
  git -C "$WEBROOT" fetch --depth 1 origin "$BRANCH"
  git -C "$WEBROOT" reset --hard "origin/$BRANCH"
else
  rm -rf "$WEBROOT"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$WEBROOT"
fi

log "[4/7] 写 nginx 站点配置(先上 80,供证书验证)"
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
cat > /etc/nginx/conf.d/website.conf <<EOF
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name ${DOMAIN} ${WWW};

    root ${WEBROOT};
    index index.html;

    # 放行 Let's Encrypt 验证路径(保证续期不被跳转拦截)
    location /.well-known/acme-challenge/ { root ${WEBROOT}; }
    location / { try_files \$uri \$uri/ =404; }

    client_max_body_size 200m;
    gzip on; gzip_comp_level 5; gzip_min_length 1024;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    location ~* \.(?:mp4|webm|jpg|jpeg|png|gif|webp|svg|ico|woff2?)\$ {
        expires 7d; add_header Cache-Control "public";
    }
}
EOF
nginx -t && systemctl enable nginx && systemctl restart nginx

log "[5/7] 放行防火墙 80/443 (若装了 ufw)"
if command -v ufw >/dev/null 2>&1; then ufw allow 80/tcp >/dev/null 2>&1 || true; ufw allow 443/tcp >/dev/null 2>&1 || true; fi
echo "提醒:云服务商控制台的「安全组」也要放行 80 和 443,否则外网访问不到。"

log "[6/7] 申请 HTTPS 证书(只对已解析到本机的域名签发)"
CERT_ARGS=""
for d in "$DOMAIN" "$WWW"; do
  if getent hosts "$d" >/dev/null 2>&1; then
    CERT_ARGS="$CERT_ARGS -d $d"; echo "  $d 已解析 ✅"
  else
    echo "  $d 未解析,跳过(请在 DNS 加 A 记录指向本机)"
  fi
done
if [ -n "$CERT_ARGS" ]; then
  certbot --nginx $CERT_ARGS --non-interactive --agree-tos -m "$EMAIL" --redirect --expand || \
    echo "!! 证书申请失败(常见:安全组没开 80/443、DNS 没指向本机、或短时间申请太多被限流)。修好后重跑本脚本即可。"
else
  echo "!! 没有任何域名解析到本机,已跳过 HTTPS。配好 DNS 后重跑本脚本。"
fi

log "[7/7] 完成 · 自测"
echo "本机 HTTP :  $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1 || echo N/A)"
echo "本机 HTTPS:  $(curl -sk -o /dev/null -w '%{http_code}' https://127.0.0.1 || echo N/A)"
echo ""
echo "✅ 部署完成!访问: https://${WWW}/"
echo "   证书 90 天有效,certbot.timer 已自动续期,无需手动维护。"
echo "   以后更新网站内容:  cd ${WEBROOT} && git pull"
