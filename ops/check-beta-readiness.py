#!/usr/bin/env python3
"""Validate evidence; strict mode also rejects outstanding release blockers."""
import argparse
import pathlib
import sys
from datetime import datetime, timezone

from beta_evidence import (ROOT, ROLES, PLATFORMS, attestation, history,
                           objectives, read_object, scenarios, versioned, write_json)

REQUIRED = [
    "beta/PRIVACY.fr.md", "beta/DATA_RETENTION.md", "beta/SUPPORT.md",
    "beta/CLOSED_BETA_CHECKLIST.md", "beta/APPROVALS.json",
    "beta/DEVICE_VALIDATION.json", "beta/SIEM_VALIDATION.json", "ops/RUNBOOK.md",
    "ops/recovery-objectives.json", "ops/recovery-history.json",
]


def evaluate(root):
    blockers, errors = [], []
    missing = [name for name in REQUIRED if not (root / name).is_file()]
    if missing:
        return {"ready": False, "blockers": [], "errors": ["Missing artifacts: " + ", ".join(missing)]}

    def check(label, action):
        try:
            action()
        except (ValueError, TypeError, KeyError, OSError) as exc:
            errors.append(f"{label}: {exc}")

    def approvals():
        entries = versioned(read_object(root / "beta/APPROVALS.json")).get("approvals")
        if not isinstance(entries, dict) or set(entries) != ROLES:
            raise ValueError("exactly privacy_legal, support_owner and data_retention_owner are required")
        for role, item in entries.items():
            if not attestation(item, "approved", {"pending", "approved"}, ["approver"], "approved_at"):
                blockers.append(f"human approval: {role}")

    def devices():
        entries = versioned(read_object(root / "beta/DEVICE_VALIDATION.json")).get("platforms")
        if not isinstance(entries, dict) or set(entries) != PLATFORMS:
            raise ValueError("exactly android and ios are required")
        for platform, item in entries.items():
            passed = attestation(item, "passed", {"pending", "passed", "failed"}, ["tester", "build_id"], "tested_at")
            scenarios(item)
            if not passed:
                blockers.append(f"physical device evidence: {platform}")

    def siem():
        item = versioned(read_object(root / "beta/SIEM_VALIDATION.json"))
        passed = attestation(item, "passed", {"pending", "passed", "failed"}, ["tester"], "tested_at")
        for name in ("aggregate_received", "transit_denial_alert_received"):
            if type(item.get(name)) is not bool:
                raise ValueError(f"{name} must be a boolean")
            if passed and not item[name]:
                raise ValueError("passed SIEM evidence requires aggregate and denial alert reception")
        if not passed:
            blockers.append("SIEM aggregate and Transit denial alert evidence")

    def recovery():
        targets = objectives(read_object(root / "ops/recovery-objectives.json"))
        passed = history(read_object(root / "ops/recovery-history.json"), targets)
        if len(passed) < 3:
            blockers.append(f"recovery exercises ({len(passed)}/3)")
        if passed and (datetime.now(timezone.utc) - max(passed)).total_seconds() > targets["exercise_frequency_days"] * 86400:
            blockers.append("latest successful recovery exercise is overdue")

    for label, action in (("Approvals", approvals), ("Devices", devices), ("SIEM", siem), ("Recovery", recovery)):
        check(label, action)
    return {"ready": not blockers and not errors, "blockers": blockers, "errors": errors}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--root", type=pathlib.Path, default=ROOT)
    parser.add_argument("--output", type=pathlib.Path, help="write a JSON readiness report")
    args = parser.parse_args()
    report = evaluate(args.root)
    if args.output:
        write_json(args.output, report)
    for error in report["errors"]:
        print(error, file=sys.stderr)
    for blocker in report["blockers"]:
        print("Closed beta blocker: " + blocker)
    if report["ready"]:
        print("Closed beta readiness: approved")
    return int(bool(report["errors"]) or (args.strict and not report["ready"]))


if __name__ == "__main__":
    raise SystemExit(main())
