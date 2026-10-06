"""Regression tests use synthetic evidence only inside disposable directories."""
import copy
import importlib.util
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

OPS = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(OPS))
from beta_evidence import ROOT, ROLES, SCENARIOS

spec = importlib.util.spec_from_file_location("readiness", OPS / "check-beta-readiness.py")
readiness = importlib.util.module_from_spec(spec)
spec.loader.exec_module(readiness)


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in readiness.REQUIRED:
            target = self.root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(ROOT / name, target)
        # Keep fixtures independent of real approvals and future target changes.
        self.write("beta/APPROVALS.json", {"version": 1, "approvals": {
            role: {"status": "pending"} for role in ROLES}})
        self.write("beta/DEVICE_VALIDATION.json", {"version": 1, "platforms": {
            platform: {"status": "pending", "scenarios": []} for platform in ["android", "ios"]}})
        self.write("beta/SIEM_VALIDATION.json", {"version": 1, "status": "pending",
                   "aggregate_received": False, "transit_denial_alert_received": False})
        self.write("ops/recovery-history.json", {"version": 1, "exercises": []})
        self.write("ops/recovery-objectives.json", {"rto_seconds": 60, "rpo_seconds": 86400,
                   "exercise_frequency_days": 7})
        self.now = datetime.now(timezone.utc) - timedelta(minutes=1)
        self.date = self.now.isoformat()
        self.proof = "https://example.org/evidence/fixture"

    def write(self, path, data):
        (self.root / path).write_text(json.dumps(data))

    def read(self, path):
        return json.loads((self.root / path).read_text())

    def ready_fixture(self):
        self.write("beta/APPROVALS.json", {"version": 1, "approvals": {
            role: {"status": "approved", "approver": "Fixture", "approved_at": self.date, "evidence": self.proof}
            for role in ROLES}})
        self.write("beta/DEVICE_VALIDATION.json", {"version": 1, "platforms": {
            platform: {"status": "passed", "tester": "Fixture", "tested_at": self.date,
                       "build_id": "fixture", "scenarios": sorted(SCENARIOS), "evidence": self.proof}
            for platform in ["android", "ios"]}})
        self.write("beta/SIEM_VALIDATION.json", {"version": 1, "status": "passed", "tester": "Fixture",
                   "tested_at": self.date, "evidence": self.proof, "aggregate_received": True,
                   "transit_denial_alert_received": True})
        self.write("ops/recovery-history.json", {"version": 1, "exercises": [
            {"status": "passed", "exercised_at": (self.now - timedelta(days=i)).isoformat(),
             "measured_rto_seconds": 1, "measured_rpo_seconds": 2, "evidence": self.proof + str(i)}
            for i in range(3)]})

    def run_script(self, script, *args):
        return subprocess.run([sys.executable, "-B", str(OPS / script), *map(str, args)],
                              capture_output=True, text=True)

    def test_pending_is_valid_but_strict_fails_and_reports(self):
        output = self.root / "report.json"
        result = self.run_script("check-beta-readiness.py", "--root", self.root, "--output", output)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(output.read_text())
        self.assertFalse(report["ready"])
        self.assertEqual(len(report["blockers"]), 7)
        self.assertEqual(report["errors"], [])
        self.assertEqual(self.run_script("check-beta-readiness.py", "--root", self.root, "--strict").returncode, 1)

    def test_complete_fixture_passes_strict(self):
        self.ready_fixture()
        result = self.run_script("check-beta-readiness.py", "--root", self.root, "--strict")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_missing_roles_cannot_bypass(self):
        self.ready_fixture()
        self.write("beta/APPROVALS.json", {"version": 1, "approvals": {}})
        self.assertTrue(readiness.evaluate(self.root)["errors"])

    def test_invalid_dates_identities_and_references(self):
        self.ready_fixture()
        original = self.read("beta/APPROVALS.json")
        for field, values in {
            "approver": [" ", False, []],
            "approved_at": ["2026-01-01", "2026-01-01T00:00:00", "2999-01-01T00:00:00Z", 3],
            "evidence": [" ", "test://fake", "http://example.org", "https://user:secret@example.org", "https://"],
        }.items():
            for value in values:
                with self.subTest(field=field, value=value):
                    data = copy.deepcopy(original)
                    data["approvals"]["privacy_legal"][field] = value
                    self.write("beta/APPROVALS.json", data)
                    self.assertTrue(readiness.evaluate(self.root)["errors"])

    def test_invalid_measurements(self):
        self.ready_fixture()
        original = self.read("ops/recovery-history.json")
        for value in [-1, True, "1", None, float("nan"), float("inf"), 10**1000]:
            with self.subTest(value=str(value)[:30]):
                data = copy.deepcopy(original)
                data["exercises"][0]["measured_rto_seconds"] = value
                self.write("ops/recovery-history.json", data)
                self.assertTrue(readiness.evaluate(self.root)["errors"])

    def test_duplicate_reference_rejected(self):
        self.ready_fixture()
        data = self.read("ops/recovery-history.json")
        data["exercises"][1]["evidence"] = data["exercises"][0]["evidence"]
        self.write("ops/recovery-history.json", data)
        self.assertTrue(readiness.evaluate(self.root)["errors"])

    def test_equivalent_timestamps_are_duplicates(self):
        self.ready_fixture()
        data = self.read("ops/recovery-history.json")
        data["exercises"][1]["exercised_at"] = self.now.astimezone(timezone(timedelta(hours=2))).isoformat()
        self.write("ops/recovery-history.json", data)
        self.assertTrue(readiness.evaluate(self.root)["errors"])

    def test_stale_history_blocks_release(self):
        self.ready_fixture()
        data = self.read("ops/recovery-history.json")
        for i, entry in enumerate(data["exercises"]):
            entry["exercised_at"] = (self.now - timedelta(days=30+i)).isoformat()
        self.write("ops/recovery-history.json", data)
        report = readiness.evaluate(self.root)
        self.assertEqual(report["errors"], [])
        self.assertIn("latest successful recovery exercise is overdue", report["blockers"])

    def test_malformed_containers_fail_cleanly(self):
        for name in ["beta/APPROVALS.json", "beta/DEVICE_VALIDATION.json", "ops/recovery-history.json", "beta/SIEM_VALIDATION.json"]:
            for value in [[], None, {"version": True}, {"version": 1}]:
                with self.subTest(name=name, value=value):
                    self.ready_fixture()
                    self.write(name, value)
                    report = readiness.evaluate(self.root)
                    self.assertTrue(report["errors"])
        (self.root / "beta/APPROVALS.json").write_text("{broken")
        result = self.run_script("check-beta-readiness.py", "--root", self.root)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn("Traceback", result.stderr)

    def test_siem_missing_alert_cannot_pass(self):
        self.ready_fixture()
        data = self.read("beta/SIEM_VALIDATION.json")
        data["transit_denial_alert_received"] = False
        self.write("beta/SIEM_VALIDATION.json", data)
        self.assertTrue(readiness.evaluate(self.root)["errors"])

    def device_args(self):
        return ["--root", self.root, "device", "android", "--tester", "Fixture", "--build-id", "fixture",
                "--tested-at", self.date, "--evidence", self.proof]

    def test_partial_device_success_does_not_write(self):
        before = (self.root / "beta/DEVICE_VALIDATION.json").read_bytes()
        result = self.run_script("record-beta-evidence.py", *self.device_args(), "--status", "passed", "--scenario", "camera")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / "beta/DEVICE_VALIDATION.json").read_bytes(), before)

    def test_device_success_is_explicit_and_preserves_date(self):
        args = self.device_args() + ["--status", "passed"]
        for scenario in sorted(SCENARIOS):
            args += ["--scenario", scenario]
        result = self.run_script("record-beta-evidence.py", *args)
        self.assertEqual(result.returncode, 0, result.stderr)
        item = self.read("beta/DEVICE_VALIDATION.json")["platforms"]["android"]
        self.assertEqual(item["tested_at"], self.date)
        self.assertEqual(item["scenarios"], sorted(SCENARIOS))

    def test_failed_device_can_be_recorded(self):
        result = self.run_script("record-beta-evidence.py", *self.device_args(), "--status", "failed", "--scenario", "camera")
        self.assertEqual(result.returncode, 0, result.stderr)
        report = readiness.evaluate(self.root)
        self.assertFalse(report["errors"])
        self.assertIn("physical device evidence: android", report["blockers"])

    def test_siem_recorder_requires_both_confirmations(self):
        args = ["--root", self.root, "siem", "--tester", "Fixture", "--tested-at", self.date,
                "--evidence", self.proof, "--status", "passed", "--aggregate-received"]
        before = (self.root / "beta/SIEM_VALIDATION.json").read_bytes()
        result = self.run_script("record-beta-evidence.py", *args)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((self.root / "beta/SIEM_VALIDATION.json").read_bytes(), before)
        result = self.run_script("record-beta-evidence.py", *args, "--transit-denial-alert-received")
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_recovery_import_is_not_counted_twice(self):
        result_file = self.root / "result.json"
        self.write("result.json", {"measured_rto_seconds": 1, "measured_rpo_seconds": 2, "exercised_at": self.date})
        output = self.root / "ops/recovery-history.json"
        args = [result_file, "--evidence", self.proof, "--output", output]
        result = self.run_script("record-recovery-result.py", *args)
        self.assertEqual(result.returncode, 0, result.stderr)
        before = output.read_bytes()
        result = self.run_script("record-recovery-result.py", *args)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(output.read_bytes(), before)
        self.assertEqual(self.read("ops/recovery-history.json")["exercises"][0]["exercised_at"], self.date)

    def test_recovery_without_actual_date_is_rejected(self):
        self.write("result.json", {"measured_rto_seconds": 1, "measured_rpo_seconds": 2})
        output = self.root / "candidate.json"
        result = self.run_script("record-recovery-result.py", self.root / "result.json", "--evidence", self.proof, "--output", output)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(output.exists())


    def test_failed_recovery_is_saved_but_not_counted(self):
        target = json.loads((ROOT / "ops/recovery-objectives.json").read_text())["rto_seconds"]
        self.write("result.json", {"measured_rto_seconds": target + 1, "measured_rpo_seconds": 2, "exercised_at": self.date})
        output = self.root / "ops/recovery-history.json"
        result = self.run_script("record-recovery-result.py", self.root / "result.json", "--evidence", self.proof, "--output", output)
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertEqual(self.read("ops/recovery-history.json")["exercises"][0]["status"], "failed")
        self.assertIn("recovery exercises (0/3)", readiness.evaluate(self.root)["blockers"])

    def test_boolean_objective_is_rejected(self):
        data = self.read("ops/recovery-objectives.json")
        data["rto_seconds"] = True
        self.write("ops/recovery-objectives.json", data)
        self.assertTrue(readiness.evaluate(self.root)["errors"])

    def test_missing_artifact_fails_even_without_strict(self):
        (self.root / "beta/SIEM_VALIDATION.json").unlink()
        result = self.run_script("check-beta-readiness.py", "--root", self.root)
        self.assertEqual(result.returncode, 1)
        self.assertIn("SIEM_VALIDATION.json", result.stderr)

    def test_approval_recorder_preserves_actual_decision(self):
        result = self.run_script("record-beta-evidence.py", "--root", self.root,
                                 "approval", "privacy_legal", "--approver", "Fixture",
                                 "--approved-at", self.date, "--evidence", self.proof)
        self.assertEqual(result.returncode, 0, result.stderr)
        item = self.read("beta/APPROVALS.json")["approvals"]["privacy_legal"]
        self.assertEqual(item["approved_at"], self.date)
        self.assertEqual(item["status"], "approved")

if __name__ == "__main__":
    unittest.main()
