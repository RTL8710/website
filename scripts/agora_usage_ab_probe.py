#!/usr/bin/env python3
"""Agora 音视频用量 A/B 探针（对比改前/改后是否生效）。

声网用量相对 Console 可能延迟数小时，因此本脚本做「打点快照 + 差分」：

  1) 改前：python3 scripts/agora_usage_ab_probe.py snap --label before-idle
  2) 做一轮对照会话（见 --print-protocol）
  3) 等用量刷新后：python3 scripts/agora_usage_ab_probe.py snap --label after-preview5m
  4) 对比：python3 scripts/agora_usage_ab_probe.py diff --a before-idle --b after-preview5m

密钥：amplify/.../ .agora-rest.local.json 或环境变量 AGORA_CUSTOMER_ID / AGORA_CUSTOMER_SECRET
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAP_DIR = ROOT / ".agora-ab-snaps"
REST_CANDIDATES = [
    Path("/Users/jinhuilv/source/flutter/ahstools/amplify/backend/api/anhaivisionwebsite/.agora-rest.local.json"),
    ROOT / ".agora-rest.local.json",
]


def load_creds():
    cid = os.environ.get("AGORA_CUSTOMER_ID", "").strip()
    sec = os.environ.get("AGORA_CUSTOMER_SECRET", "").strip()
    if cid and sec:
        return cid, sec
    for p in REST_CANDIDATES:
        if p.is_file():
            d = json.loads(p.read_text())
            return d["customerId"], d["customerSecret"]
    raise SystemExit(
        "缺少 Agora REST 密钥：设 AGORA_CUSTOMER_ID/SECRET 或写 .agora-rest.local.json"
    )


def auth_header(cid: str, sec: str) -> str:
    token = base64.b64encode(f"{cid}:{sec}".encode()).decode()
    return f"Basic {token}"


def http_json(url: str, headers: dict):
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise SystemExit(f"HTTP {e.code} {url}: {body[:400]}") from e


def list_projects(cid, sec):
    url = "https://api.agora.io/dev/v1/projects"
    data = http_json(url, {"Authorization": auth_header(cid, sec)})
    return data.get("projects") or data.get("data") or []


def usage_query(cid, sec, project_id: str, from_date: str, to_date: str):
    # Console REST usage（与 AppSync HTTP 同源）
    q = (
        f"https://api.agora.io/dev/v3/usage"
        f"?project_id={project_id}&from_date={from_date}&to_date={to_date}&business=default"
    )
    return http_json(q, {"Authorization": auth_header(cid, sec)})


def sum_usage(usages):
    audio = hd = hdp = fhd = v2k = v4k = 0
    for row in usages or []:
        u = row.get("usage") or {}
        audio += int(u.get("durationAudioAll") or 0)
        hd += int(u.get("durationVideoHd") or 0)
        hdp += int(u.get("durationVideoHdp") or 0)
        fhd += int(u.get("durationVideo1080P") or 0)
        v2k += int(u.get("durationVideo2K") or 0)
        v4k += int(u.get("durationVideo4K") or 0)
    video = hd + hdp + fhd + v2k + v4k
    std = (
        audio / 60
        + (hd / 60) * 4
        + (hdp / 60) * 4
        + (fhd / 60) * 9
        + (v2k / 60) * 16
        + (v4k / 60) * 36
    )
    return {
        "audio_sec": audio,
        "video_sec": video,
        "hd_sec": hd,
        "hdp_sec": hdp,
        "fhd_sec": fhd,
        "v2k_sec": v2k,
        "v4k_sec": v4k,
        "std_min": round(std, 4),
        "audio_min": round(audio / 60, 4),
        "video_min": round(video / 60, 4),
        "audio_share": round(audio / max(audio + video, 1), 4),
    }


def month_range_utc():
    now = datetime.now(timezone.utc)
    frm = f"{now.year:04d}-{now.month:02d}-01"
    to = now.date().isoformat()
    return frm, to


def cmd_snap(args):
    cid, sec = load_creds()
    projects = list_projects(cid, sec)
    if not projects:
        raise SystemExit("无项目")
    pid = args.project_id
    if not pid:
        robot = next((p for p in projects if "robot" in str(p.get("name", "")).lower()), None)
        pid = (robot or projects[0]).get("id") or (robot or projects[0]).get("projectId")
    frm, to = month_range_utc()
    raw = usage_query(cid, sec, str(pid), frm, to)
    usages = raw.get("usages") or raw.get("data") or []
    summary = sum_usage(usages)
    snap = {
        "label": args.label,
        "at": datetime.now(timezone.utc).isoformat(),
        "projectId": str(pid),
        "fromDate": frm,
        "toDate": to,
        "summary": summary,
        "note": args.note or "",
    }
    SNAP_DIR.mkdir(parents=True, exist_ok=True)
    out = SNAP_DIR / f"{args.label}.json"
    out.write_text(json.dumps(snap, ensure_ascii=False, indent=2))
    print(json.dumps(snap, ensure_ascii=False, indent=2))
    print(f"\n写入 {out}", file=sys.stderr)


def cmd_diff(args):
    a = json.loads((SNAP_DIR / f"{args.a}.json").read_text())
    b = json.loads((SNAP_DIR / f"{args.b}.json").read_text())
    sa, sb = a["summary"], b["summary"]
    d = {k: round(sb[k] - sa[k], 4) for k in sa if isinstance(sa[k], (int, float))}
    # 判定：改后会话若以视频为主，增量 audio_share 应显著下降；
    # 或 audio_sec 增量 << video_sec 增量（理想：audioΔ≈0，videoΔ>0）
    verdict = "INCONCLUSIVE"
    tips = []
    if d.get("audio_sec", 0) == 0 and d.get("video_sec", 0) == 0:
        verdict = "NO_DELTA"
        tips.append("用量无变化：可能延迟未刷新，或会话未产生新分钟。数小时后再 snap。")
    elif d.get("video_sec", 0) > 0 and d.get("audio_sec", 0) <= max(5, 0.15 * d["video_sec"]):
        verdict = "PASS_LIKELY"
        tips.append("视频增量明显且音频增量很少 → 停订音频很可能生效。")
    elif d.get("audio_sec", 0) > d.get("video_sec", 0) * 2:
        verdict = "FAIL_LIKELY"
        tips.append("音频增量仍远大于视频 → 仍有进房挂起/多 UID 空挂，或用量含改前尾巴。")
    else:
        tips.append("混合结果：对照设备 idle leave 日志与会话墙钟再判。")
    out = {"a": args.a, "b": args.b, "delta": d, "verdict": verdict, "tips": tips,
           "a_at": a.get("at"), "b_at": b.get("at")}
    print(json.dumps(out, ensure_ascii=False, indent=2))
    return 0 if verdict.startswith("PASS") else 1


def cmd_protocol(_args):
    print(
        """
=== Agora 音频分钟对比协议（建议同一设备 / 同一项目）===

【基线】设备已部署 idle leave（默认 30s 无人离会）
A. 改前 App/网页（仍 autoSubscribeAudio / subscribe audio）
   1) snap --label t0_before_code
   2) App 打开预览恰好 5 分钟（出画），不要开麦，然后离开
   3) 等 ≥4h 用量刷新 → snap --label t1_after_old_5m
   4) diff --a t0_before_code --b t1_after_old_5m
      预期：audioΔ 与 videoΔ 同量级，或 audioΔ 更大

B. 改后 App/网页（不订音频）
   1) snap --label t2_before_new
   2) 同样预览 5 分钟出画、不开麦、离开；确认设备日志 agoraIdleLeave
   3) 等 ≥4h → snap --label t3_after_new_5m
   4) diff --a t2_before_new --b t3_after_new_5m
      通过标准：videoΔ > 0 且 audioΔ ≤ max(5s, 0.15×videoΔ) → PASS_LIKELY

注意：月累计快照差分会混入其它会话；尽量选低流量窗口，或看按日 usages 里测试日一行。
""".strip()
    )


def main():
    ap = argparse.ArgumentParser(description="Agora usage A/B probe")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("snap", help="打一份月累计用量快照")
    s.add_argument("--label", required=True)
    s.add_argument("--project-id", default="")
    s.add_argument("--note", default="")
    s.set_defaults(func=cmd_snap)
    d = sub.add_parser("diff", help="对比两份快照")
    d.add_argument("--a", required=True)
    d.add_argument("--b", required=True)
    d.set_defaults(func=cmd_diff)
    p = sub.add_parser("protocol", help="打印对比测试步骤")
    p.set_defaults(func=cmd_protocol)
    args = ap.parse_args()
    rc = args.func(args)
    sys.exit(rc if isinstance(rc, int) else 0)


if __name__ == "__main__":
    main()
