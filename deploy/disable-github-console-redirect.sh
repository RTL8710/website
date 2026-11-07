#!/usr/bin/env bash
# 去掉 anhaishi.cn nginx 把 /console 302 到 rtl8710.github.io 的配置，让控制台/管理后台留在本域。
# 幂等；由 deploy-server.yml 在 git 同步后执行。需 root。
set -euo pipefail

CONF_DIRS=(/etc/nginx/conf.d /etc/nginx/sites-enabled /etc/nginx/sites-available)
CHANGED=0
BACKUP_DIR="/etc/nginx/backup-disable-gh-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"

for d in "${CONF_DIRS[@]}"; do
  [ -d "$d" ] || continue
  while IFS= read -r -d '' f; do
    if grep -q 'rtl8710\.github\.io' "$f" 2>/dev/null; then
      cp -a "$f" "$BACKUP_DIR/"
      # 删掉整段 location … { … github.io … }（简单括号匹配）
      python3 - "$f" <<'PY'
import re, sys
path = sys.argv[1]
text = open(path, encoding='utf-8', errors='replace').read()
orig = text
# 去掉任何含 rtl8710.github.io 的 location 块
pat = re.compile(
    r'location\s+[^{]*\{(?:[^{}]|\{[^{}]*\})*rtl8710\.github\.io(?:[^{}]|\{[^{}]*\})*\}',
    re.S,
)
text2, n = pat.subn('', text)
# 再清残留单行 return/rewrite
text2 = re.sub(r'^[ \t]*(?:return|rewrite)[^\n]*rtl8710\.github\.io[^\n]*\n', '', text2, flags=re.M)
if text2 != orig:
    open(path, 'w', encoding='utf-8').write(text2)
    print(f'patched {path} (location blocks≈{n})')
else:
    print(f'no structural change {path}')
PY
      CHANGED=1
    fi
  done < <(find "$d" -type f \( -name '*.conf' -o -name '*' \) ! -name '*.bak*' -print0 2>/dev/null)
done

if [ "$CHANGED" -eq 1 ]; then
  nginx -t
  systemctl reload nginx
  echo "✅ nginx reloaded; backups in $BACKUP_DIR"
else
  echo "ℹ️  no rtl8710.github.io redirects found in nginx conf"
fi

# 自检：本机不应再 302 到 github
code=$(curl -sI -o /tmp/ahs_console_hdr.txt -w '%{http_code}' http://127.0.0.1/console/ || true)
loc=$(awk 'tolower($1)=="location:"{print $2}' /tmp/ahs_console_hdr.txt | tr -d '\r' | head -1)
echo "local /console/ -> HTTP $code Location=${loc:-none}"
if echo "$loc" | grep -q 'rtl8710.github.io'; then
  echo "!! still redirecting to GitHub Pages" >&2
  exit 1
fi
