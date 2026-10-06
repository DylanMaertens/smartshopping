#!/usr/bin/env python3
"""Compile all four official taxonomies to a small, offline tag → aisle index.

Use --input-dir with taxonomy-{food,products,beauty,petfood}.json for reproducible
offline imports. The snapshot records source digests; no network during app use.
"""
import argparse
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

SOURCES = {"food": "openfoodfacts", "products": "openproductsfacts",
           "beauty": "openbeautyfacts", "petfood": "openpetfoodfacts"}
ROOT = Path(__file__).resolve().parents[1]


def compile_taxonomy(taxonomy, rules):
    seeds = {tag: rule["categoryId"] for rule in reversed(rules) for tag in rule["tags"]}
    rank = {rule["categoryId"]: i for i, rule in enumerate(rules)}
    result = {}
    for tag in sorted(taxonomy):
        pending, visited, matches = [tag], set(), set()
        while pending:
            current = pending.pop()
            if current in visited:
                continue
            visited.add(current)
            if current in seeds:
                matches.add(seeds[current])
            pending.extend(taxonomy.get(current, {}).get("parents", []))
        # Priority resolves multi-parent products: frozen vegetables stay frozen.
        # No invented association for a purely descriptive tag (e.g. "organic").
        for rule in rules:
            if visited.intersection(rule.get("excludeTags", [])):
                matches.discard(rule["categoryId"])
        result[tag] = min(matches, key=rank.get) if matches else None
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "mobile/src/services/categorization/catalogueTaxonomies.json")
    args = parser.parse_args()
    rules = json.loads((ROOT / "mobile/src/services/categorization/productCategoryTags.json").read_text())
    snapshot = {"schemaVersion": 1, "sources": {}, "provenance": {}}
    for short, source in SOURCES.items():
        url = f"https://static.{source}.org/data/taxonomies/categories.json"
        if args.input_dir:
            raw = (args.input_dir / f"taxonomy-{short}.json").read_bytes()
        else:
            with urlopen(Request(url, headers={"User-Agent": "SmartShopping taxonomy importer (https://github.com/DylanMaertens/smartshopping)"}), timeout=60) as response:
                raw = response.read()
        taxonomy = json.loads(raw)
        if not isinstance(taxonomy, dict) or not taxonomy:
            raise ValueError(f"Empty/invalid taxonomy: {source}")
        mapping = compile_taxonomy(taxonomy, rules)
        snapshot["sources"][source] = mapping
        snapshot["provenance"][source] = {"url": url, "sha256": hashlib.sha256(raw).hexdigest(),
            "categories": len(mapping), "mapped": sum(value is not None for value in mapping.values())}
        print(source, snapshot["provenance"][source]["categories"], "categories,", snapshot["provenance"][source]["mapped"], "mapped")
    args.output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n")
    if args.output == ROOT / "mobile/src/services/categorization/catalogueTaxonomies.json":
        # Backend Docker builds use backend/ as their context.
        (ROOT / "backend/src/services/catalogue_taxonomies.json").write_bytes(args.output.read_bytes())


if __name__ == "__main__":
    main()
