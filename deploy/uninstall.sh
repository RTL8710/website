#!/usr/bin/env bash
# =============================================================================
#  卸载 / 重置脚本 —— 清掉本网站在服务器上的部署,方便重来
#  会删除:nginx 站点配置、本站的 Let's Encrypt 证书、站点文件
#  不会动:nginx 本体、x-ui 等其它服务、其它站点
#
#  用法(root 执行):
#    DOMAIN=anhaishi.cn bash uninstall.sh
#    # 想保留证书:  KEEP_CERT=1 DOMAIN=anhaishi.cn bash uninstall.sh
#    # 想保留文件:  KEEP_FILES=1 DOMAIN=anhaishi.cn bash uninstall.sh
# =============================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-anhaishi.cn}"
WWW="${WWW:-www.${DOMAIN}}"
WEBROOT="${WEBROOT:-/var/www/website}"

echo "==> 删除 nginx 站点配置"
rm -f /etc/nginx/conf.d/website.conf
if nginx -t 2>/dev/null; then
  systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
fi

if [ -z "${KEEP_CERT:-}" ]; then
  echo "==> 删除本站 Let's Encrypt 证书(如有)"
  for name in "$WWW" "$DOMAIN"; do
    certbot delete --cert-name "$name" --non-interactive 2>/dev/null && echo "   已删除证书 $name" || true
  done
else
  echo "==> 保留证书(KEEP_CERT=1)"
fi

if [ -z "${KEEP_FILES:-}" ]; then
  echo "==> 删除站点文件 $WEBROOT"
  rm -rf "$WEBROOT"
else
  echo "==> 保留站点文件(KEEP_FILES=1)"
fi

echo ""
echo "✅ 已重置。nginx 本体与其它服务(如 x-ui)未动。"
echo "   重新部署:  curl -fsSL https://raw.githubusercontent.com/RTL8710/website/claude/website-auto-deploy-vnolom/deploy/ubuntu-setup.sh | DOMAIN=${DOMAIN} EMAIL=your@mail.com bash"
