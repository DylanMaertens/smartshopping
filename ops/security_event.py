"""Only this fixed aggregate schema may leave the Vault audit pipeline."""
SCHEMA = "smartshopping.vault-audit-summary.v1"
FIELDS = {"schema", "vault_audit_entries", "vault_errors", "status"}


def validate_event(event):
    if not isinstance(event, dict) or set(event) != FIELDS or event.get("schema") != SCHEMA:
        raise ValueError("unsupported security event fields or schema")
    entries, errors = event["vault_audit_entries"], event["vault_errors"]
    if type(entries) is not int or type(errors) is not int or not 0 <= errors <= entries or entries <= 0:
        raise ValueError("invalid security event counters")
    if event["status"] != ("alert" if errors else "ok"):
        raise ValueError("security event status disagrees with counters")
    return event
