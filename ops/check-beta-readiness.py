#!/usr/bin/env python3
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
REQUIRED = [
    "beta/PRIVACY.fr.md",
    "beta/DATA_RETENTION.md",
    "beta/SUPPORT.md",
    "beta/CLOSED_BETA_CHECKLIST.md",
    "beta/APPROVALS.json",
    "ops/RUNBOOK.md",
    "ops/recovery-objectives.json",
]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--strict", action="store_true", help="fail while an approval is pending")
    args = parser.parse_args()
    missing = [path for path in REQUIRED if not (ROOT / path).is_file()]
    if missing:
        print("Missing beta artifacts: " + ", ".join(missing), file=sys.stderr)
        return 1
    objectives = json.loads((ROOT / "ops/recovery-objectives.json").read_text())
    if any(not isinstance(objectives.get(name), int) or objectives[name] <= 0 for name in ("rto_seconds", "rpo_seconds", "exercise_frequency_days")):
        print("Recovery objectives must be positive integers", file=sys.stderr)
        return 1
    approvals = json.loads((ROOT / "beta/APPROVALS.json").read_text())["approvals"]
    invalid = [name for name, item in approvals.items() if item.get("status") not in {"pending", "approved"}]
    if invalid:
        print("Invalid approval status: " + ", ".join(invalid), file=sys.stderr)
        return 1
    pending = [name for name, item in approvals.items() if item["status"] != "approved"]
    if pending:
        print("Pending beta approvals: " + ", ".join(pending))
        return 1 if args.strict else 0
    incomplete = [name for name, item in approvals.items() if not item.get("approver") or not item.get("approved_at")]
    if incomplete:
        print("Approved entries require approver and approved_at: " + ", ".join(incomplete), file=sys.stderr)
        return 1
    print("Closed beta readiness: approved")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
