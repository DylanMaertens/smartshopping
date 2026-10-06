"""Shared release evidence validation. References are checked, never fetched."""
import json
import math
import pathlib
from datetime import datetime, timezone
from urllib.parse import urlsplit

ROOT = pathlib.Path(__file__).resolve().parents[1]
ROLES = {"privacy_legal", "support_owner", "data_retention_owner"}
PLATFORMS = {"android", "ios"}
SCENARIOS = {"camera", "offline", "recovery", "restart"}


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def timestamp(value):
    if not nonempty(value) or "T" not in value:
        raise ValueError("timestamp must include time and timezone")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError("invalid ISO timestamp") from None
    if parsed.utcoffset() is None or parsed > datetime.now(timezone.utc):
        raise ValueError("timestamp must include timezone and must not be in the future")
    return parsed.astimezone(timezone.utc)


def reference(value):
    if not nonempty(value) or any(char.isspace() for char in value):
        raise ValueError("evidence must be an HTTPS or github-actions URL")
    try:
        url = urlsplit(value)
        valid = (url.scheme in {"https", "github-actions"} and url.hostname
                 and not url.username and not url.password and url.port != 0)
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("evidence must be an HTTPS or github-actions URL without credentials")
    return value


def measurement(value):
    if type(value) not in {int, float} or (type(value) is float and not math.isfinite(value)) or value < 0:
        raise ValueError("recovery measurements must be finite non-negative numbers")
    return value


def read_object(path):
    data = json.loads(path.read_text())
    if not isinstance(data, dict):
        raise ValueError(f"{path.name}: expected a JSON object")
    return data


def versioned(data):
    if type(data.get("version")) is not int or data["version"] != 1:
        raise ValueError("evidence version must be 1")
    return data


def objectives(data):
    for name in ("rto_seconds", "rpo_seconds", "exercise_frequency_days"):
        if type(data.get(name)) is not int or data[name] <= 0:
            raise ValueError("recovery objectives must be positive integers")
    return data


def fields(item, names):
    if not isinstance(item, dict):
        raise ValueError("evidence entry must be an object")
    for name in names:
        if not nonempty(item.get(name)):
            raise ValueError(f"{name} must be a non-empty string")


def attestation(item, success, statuses, names, date_field):
    fields(item, [])
    if not isinstance(item.get("status"), str) or item["status"] not in statuses:
        raise ValueError("invalid evidence status")
    if item["status"] != "pending":
        fields(item, names)
        timestamp(item.get(date_field))
        reference(item.get("evidence"))
    return item["status"] == success


def scenarios(item):
    values = item.get("scenarios", [])
    if (not isinstance(values, list) or any(not isinstance(v, str) for v in values)
            or len(values) != len(set(values)) or not set(values) <= SCENARIOS):
        raise ValueError("scenarios must be a list of distinct known scenarios")
    if item.get("status") == "passed" and set(values) != SCENARIOS:
        raise ValueError("passed device evidence requires all four explicit scenarios")


def drill(item, targets):
    fields(item, [])
    instant = timestamp(item.get("exercised_at"))
    reference(item.get("evidence"))
    rto = measurement(item.get("measured_rto_seconds"))
    rpo = measurement(item.get("measured_rpo_seconds"))
    if not isinstance(item.get("status"), str) or item["status"] not in {"passed", "failed"}:
        raise ValueError("invalid exercise status")
    within = rto <= targets["rto_seconds"] and rpo <= targets["rpo_seconds"]
    if item["status"] == "passed" and not within:
        raise ValueError("passed exercise exceeds recovery targets")
    return instant, item["status"] == "passed" and within


def history(data, targets):
    entries = versioned(data).get("exercises")
    if not isinstance(entries, list):
        raise ValueError("exercises must be a list")
    dates, references, passed = set(), set(), []
    for item in entries:
        instant, success = drill(item, targets)
        if instant in dates or item["evidence"] in references:
            raise ValueError("duplicate exercise timestamp or evidence reference")
        dates.add(instant)
        references.add(item["evidence"])
        if success:
            passed.append(instant)
    return passed


def write_json(path, data):
    # Validate before calling; replace atomically to avoid partial evidence files.
    import os
    import tempfile
    with tempfile.NamedTemporaryFile(mode="w", dir=path.parent, encoding="utf-8", delete=False) as stream:
        temporary = pathlib.Path(stream.name)
        try:
            json.dump(data, stream, indent=2, ensure_ascii=False, allow_nan=False)
            stream.write("\n")
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
