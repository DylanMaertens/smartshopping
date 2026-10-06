import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("importer", Path(__file__).parents[1] / "import-product-taxonomies.py")
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)


class TaxonomyImportTest(unittest.TestCase):
    def test_alcohol_free_child_does_not_inherit_alcohol_aisle(self):
        data = {"en:zero-beer": {"parents": ["en:beers", "en:non-alcoholic-beverages"]},
                "en:beers": {"parents": ["en:beverages"]}, "en:non-alcoholic-beverages": {"parents": ["en:beverages"]}}
        rules = [{"categoryId": "alcools", "tags": ["en:beers"], "excludeTags": ["en:non-alcoholic-beverages"]},
                 {"categoryId": "boissons", "tags": ["en:beverages"]}]
        self.assertEqual(importer.compile_taxonomy(data, rules)["en:zero-beer"], "boissons")

    def test_ancestors_priority_cycles_and_unknown_tags(self):
        data = {
            "en:frozen-peas": {"parents": ["en:vegetables", "en:frozen-foods"]},
            "en:vegetables": {}, "en:frozen-foods": {},
            "en:cycle-a": {"parents": ["en:cycle-b"]},
            "en:cycle-b": {"parents": ["en:cycle-a"]},
            "en:organic": {},
        }
        rules = [{"categoryId": "surgeles", "tags": ["en:frozen-foods"]},
                 {"categoryId": "fruits-legumes", "tags": ["en:vegetables"]}]
        result = importer.compile_taxonomy(data, rules)
        self.assertEqual(set(result), set(data))
        self.assertEqual(result["en:frozen-peas"], "surgeles")
        self.assertIsNone(result["en:organic"])
        self.assertIsNone(result["en:cycle-a"])


if __name__ == "__main__":
    unittest.main()
