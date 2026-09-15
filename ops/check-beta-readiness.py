#!/usr/bin/env python3
import argparse
import json
import pathlib
import sys
from datetime import datetime

ROOT = pathlib.Path(__file__).resolve().parents[1]
REQUIRED = [
    "beta/PRIVACY.fr.md",
    "beta/DATA_RETENTION.md",
    "beta/SUPPORT.md",
    "beta/CLOSED_BETA_CHECKLIST.md",
    "beta/APPROVALS.json",
    "beta/DEVICE_VALIDATION.json",
    "ops/RUNBOOK.md",
    "ops/recovery-objectives.json",
    "ops/recovery-history.json",
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
    incomplete = [
        name for name, item in approvals.items()
        if item["status"] == "approved" and (not item.get("approver") or not iso_timestamp(item.get("approved_at")) or not item.get("evidence"))
    ]
    if incomplete:
        print("Approved entries require approver and approved_at: " + ", ".join(incomplete), file=sys.stderr)
        return 1
    validations = json.loads((ROOT / "beta/DEVICE_VALIDATION.json").read_text())["platforms"]
    invalid_devices = [
        platform for platform, evidence in validations.items()
        if evidence.get("status") not in {"pending", "passed", "failed"}
    ]
    if set(validations) != {"android", "ios"} or invalid_devices:
        print("Invalid physical validation evidence", file=sys.stderr)
        return 1
    required_scenarios = {"camera", "offline", "recovery", "restart"}
    incomplete_devices = [
        platform for platform, evidence in validations.items()
        if evidence.get("status") != "passed"
        or not all(evidence.get(field) for field in ("tester", "build_id", "evidence"))
        or not iso_timestamp(evidence.get("tested_at"))
        or not required_scenarios.issubset(evidence.get("scenarios", []))
    ]
    history = json.loads((ROOT / "ops/recovery-history.json").read_text())["exercises"]
    valid_drills = [
        drill for drill in history
        if drill.get("status") == "passed"
        and drill.get("measured_rto_seconds", objectives["rto_seconds"] + 1) <= objectives["rto_seconds"]
        and drill.get("measured_rpo_seconds", objectives["rpo_seconds"] + 1) <= objectives["rpo_seconds"]
        and drill.get("evidence")
        and iso_timestamp(drill.get("exercised_at"))
    ]
    drill_count = len({drill.get("exercised_at") for drill in valid_drills})
    blockers = []
    if pending:
        blockers.append("human approvals")
    if incomplete_devices:
        blockers.append("physical Android/iOS evidence")
    if drill_count < 3:
        blockers.append(f"recovery exercises ({drill_count}/3)")
    if blockers:
        print("Closed beta blockers: " + ", ".join(blockers))
        return 1 if args.strict else 0
    print("Closed beta readiness: approved")
    return 0


def iso_timestamp(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


if __name__ == "__main__":
    raise SystemExit(main())
