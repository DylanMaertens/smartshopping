#!/usr/bin/env python3
"""Append a measured drill once, preserving its actual execution timestamp."""
import argparse
import pathlib

from beta_evidence import ROOT, history, measurement, objectives, read_object, write_json


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("result", type=pathlib.Path)
    parser.add_argument("--evidence", required=True)
    parser.add_argument("--exercised-at", help="actual exercise time, required unless present in the result")
    parser.add_argument("--output", type=pathlib.Path, default=ROOT / "ops/recovery-history.json")
    args = parser.parse_args()
    try:
        result = read_object(args.result)
        targets = objectives(read_object(ROOT / "ops/recovery-objectives.json"))
        rto = measurement(result.get("measured_rto_seconds"))
        rpo = measurement(result.get("measured_rpo_seconds"))
        if args.exercised_at and result.get("exercised_at") and args.exercised_at != result["exercised_at"]:
            raise ValueError("exercise timestamp conflicts with result")
        entry = {
            "status": "passed" if rto <= targets["rto_seconds"] and rpo <= targets["rpo_seconds"] else "failed",
            "exercised_at": args.exercised_at or result.get("exercised_at"),
            "measured_rto_seconds": rto, "measured_rpo_seconds": rpo, "evidence": args.evidence,
        }
        data = read_object(args.output) if args.output.exists() else {"version": 1, "exercises": []}
        history(data, targets)
        data["exercises"].append(entry)
        history(data, targets)
        write_json(args.output, data)
    except (ValueError, OSError, KeyError, TypeError) as exc:
        parser.error(str(exc))
    print(f"Recorded {entry['status']} recovery exercise: {entry['exercised_at']}")
    return int(entry["status"] != "passed")


if __name__ == "__main__":
    raise SystemExit(main())
