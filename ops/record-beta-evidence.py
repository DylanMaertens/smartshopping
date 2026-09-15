#!/usr/bin/env python3
"""Create reviewable beta evidence without inventing human or device results."""
import argparse
import datetime as dt
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
sub = parser.add_subparsers(dest="kind", required=True)
approval = sub.add_parser("approval")
approval.add_argument("role", choices=["privacy_legal", "support_owner", "data_retention_owner"])
approval.add_argument("--approver", required=True)
approval.add_argument("--evidence", required=True)
device = sub.add_parser("device")
device.add_argument("platform", choices=["android", "ios"])
device.add_argument("--tester", required=True)
device.add_argument("--build-id", required=True)
device.add_argument("--evidence", required=True)
args = parser.parse_args()
now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

if args.kind == "approval":
    path = ROOT / "beta/APPROVALS.json"
    data = json.loads(path.read_text())
    data["approvals"][args.role] = {"status": "approved", "approver": args.approver, "approved_at": now, "evidence": args.evidence}
else:
    path = ROOT / "beta/DEVICE_VALIDATION.json"
    data = json.loads(path.read_text())
    data["platforms"][args.platform] = {"status": "passed", "tester": args.tester, "tested_at": now, "build_id": args.build_id, "scenarios": ["camera", "offline", "recovery", "restart"], "evidence": args.evidence}
path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
print(path.relative_to(ROOT))
