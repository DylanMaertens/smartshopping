#!/usr/bin/env python3
"""Record explicit human observations without prefilling successful scenarios."""
import argparse
import pathlib

from beta_evidence import (ROOT, ROLES, SCENARIOS, PLATFORMS, attestation,
                           read_object, scenarios, versioned, write_json)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=pathlib.Path, default=ROOT)
    sub = parser.add_subparsers(dest="kind", required=True)
    approval = sub.add_parser("approval")
    approval.add_argument("role", choices=sorted(ROLES))
    approval.add_argument("--approver", required=True)
    approval.add_argument("--approved-at", required=True)
    approval.add_argument("--evidence", required=True)
    device = sub.add_parser("device")
    device.add_argument("platform", choices=sorted(PLATFORMS))
    device.add_argument("--tester", required=True)
    device.add_argument("--build-id", required=True)
    device.add_argument("--tested-at", required=True)
    device.add_argument("--status", required=True, choices=["passed", "failed"])
    device.add_argument("--scenario", action="append", choices=sorted(SCENARIOS), required=True)
    device.add_argument("--evidence", required=True)
    siem = sub.add_parser("siem")
    siem.add_argument("--tester", required=True)
    siem.add_argument("--tested-at", required=True)
    siem.add_argument("--status", required=True, choices=["passed", "failed"])
    siem.add_argument("--aggregate-received", action="store_true")
    siem.add_argument("--transit-denial-alert-received", action="store_true")
    siem.add_argument("--evidence", required=True)
    args = parser.parse_args()
    try:
        if args.kind == "approval":
            path = args.root / "beta/APPROVALS.json"
            data = versioned(read_object(path))
            if not isinstance(data.get("approvals"), dict) or set(data["approvals"]) != ROLES:
                raise ValueError("approval file must contain all three required roles")
            item = {"status": "approved", "approver": args.approver, "approved_at": args.approved_at, "evidence": args.evidence}
            attestation(item, "approved", {"approved"}, ["approver"], "approved_at")
            data["approvals"][args.role] = item
        else:
            item = {"status": args.status, "tester": args.tester, "tested_at": args.tested_at, "evidence": args.evidence}
            if args.kind == "device":
                path = args.root / "beta/DEVICE_VALIDATION.json"
                data = versioned(read_object(path))
                if not isinstance(data.get("platforms"), dict) or set(data["platforms"]) != PLATFORMS:
                    raise ValueError("device file must contain android and ios")
                item.update(build_id=args.build_id, scenarios=args.scenario)
                attestation(item, "passed", {"passed", "failed"}, ["tester", "build_id"], "tested_at")
                scenarios(item)
                data["platforms"][args.platform] = item
            else:
                path = args.root / "beta/SIEM_VALIDATION.json"
                versioned(read_object(path))
                item.update(version=1, aggregate_received=args.aggregate_received,
                            transit_denial_alert_received=args.transit_denial_alert_received)
                attestation(item, "passed", {"passed", "failed"}, ["tester"], "tested_at")
                if args.status == "passed" and not (args.aggregate_received and args.transit_denial_alert_received):
                    raise ValueError("SIEM success requires both reception confirmations")
                data = item
        write_json(path, data)
    except (ValueError, OSError, KeyError, TypeError) as exc:
        parser.error(str(exc))
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
