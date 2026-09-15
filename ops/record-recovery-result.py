#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("result")
parser.add_argument("--evidence", required=True)
parser.add_argument("--output", default=str(ROOT / "ops/recovery-history.json"))
args = parser.parse_args()
result = json.loads(pathlib.Path(args.result).read_text())
objectives = json.loads((ROOT / "ops/recovery-objectives.json").read_text())
rto, rpo = result["measured_rto_seconds"], result["measured_rpo_seconds"]
entry = {"status": "passed" if rto <= objectives["rto_seconds"] and rpo <= objectives["rpo_seconds"] else "failed", "exercised_at": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"), "measured_rto_seconds": rto, "measured_rpo_seconds": rpo, "evidence": args.evidence}
output = pathlib.Path(args.output)
history = json.loads(output.read_text()) if output.exists() else {"version": 1, "exercises": []}
history["exercises"].append(entry)
output.write_text(json.dumps(history, indent=2) + "\n")
print(json.dumps(entry))
raise SystemExit(0 if entry["status"] == "passed" else 1)
