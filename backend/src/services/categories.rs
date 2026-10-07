use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Clone, Serialize)]
pub struct StoreCategory {
    pub id: &'static str,
    pub name: &'static str,
    pub order_index: u16,
    pub icon: &'static str,
    pub keywords: &'static [&'static str],
}

#[derive(Clone, Serialize)]
pub struct CategoryMatch {
    pub category_id: String,
    pub category_name: String,
    pub confidence: f32,
}

pub const STORE_CATEGORIES: &[StoreCategory] = &[
    StoreCategory {
        id: "fruits-legumes",
        name: "Fruits & légumes",
        order_index: 10,
        icon: "carrot",
        keywords: &[
            "fruit", "legume", "légume", "salade", "tomate", "pomme", "banane",
        ],
    },
    StoreCategory {
        id: "boulangerie",
        name: "Boulangerie",
        order_index: 20,
        icon: "bread",
        keywords: &["pain", "baguette", "brioche", "croissant", "viennoiserie"],
    },
    StoreCategory {
        id: "cremerie",
        name: "Crémerie & produits laitiers",
        order_index: 30,
        icon: "milk",
        keywords: &[
            "lait", "yaourt", "fromage", "beurre", "creme", "crème", "laitier",
        ],
    },
    StoreCategory {
        id: "boucherie-poissonnerie",
        name: "Boucherie & poissonnerie",
        order_index: 40,
        icon: "drumstick",
        keywords: &[
            "viande", "poulet", "boeuf", "bœuf", "porc", "jambon", "poisson", "saumon", "thon",
        ],
    },
    StoreCategory {
        id: "surgeles",
        name: "Surgelés",
        order_index: 50,
        icon: "snowflake",
        keywords: &["surgelé", "surgele", "glace", "pizza surgel", "frozen"],
    },
    StoreCategory {
        id: "epicerie-salee",
        name: "Épicerie salée",
        order_index: 60,
        icon: "wheat",
        keywords: &[
            "pates", "pâtes", "riz", "huile", "vinaigre", "sel", "conserve", "sauce", "chips",
            "farine",
        ],
    },
    StoreCategory {
        id: "epicerie-sucree",
        name: "Épicerie sucrée",
        order_index: 70,
        icon: "cookie",
        keywords: &[
            "sucre",
            "chocolat",
            "biscuit",
            "cereale",
            "céréale",
            "confiture",
            "miel",
            "dessert",
        ],
    },
    StoreCategory {
        id: "alcools",
        name: "Alcools",
        order_index: 85,
        icon: "wine",
        keywords: &[
            "vin",
            "vins",
            "bière",
            "bières",
            "cidre",
            "champagne",
            "prosecco",
            "rhum",
            "whisky",
            "whiskey",
            "vodka",
            "gin",
            "tequila",
            "cognac",
            "liqueur",
            "pastis",
            "porto",
            "apéritif",
            "boisson alcoolisée",
        ],
    },
    StoreCategory {
        id: "boissons",
        name: "Boissons",
        order_index: 80,
        icon: "bottle",
        keywords: &[
            "eau", "jus", "soda", "cafe", "café", "the", "thé", "boisson", "biere", "bière",
        ],
    },
    StoreCategory {
        id: "hygiene-beaute",
        name: "Hygiène & beauté",
        order_index: 90,
        icon: "sparkles",
        keywords: &[
            "shampooing",
            "savon",
            "dentifrice",
            "deodorant",
            "déodorant",
            "hygiene",
            "hygiène",
            "serviette hygiénique",
            "serviettes hygiéniques",
            "tampon périodique",
            "tampons périodiques",
            "protège-slip",
            "protège-slips",
            "coupe menstruelle",
            "culotte menstruelle",
        ],
    },
    StoreCategory {
        id: "complements-alimentaires",
        name: "Compléments alimentaires",
        order_index: 95,
        icon: "pill",
        keywords: &[
            "complément alimentaire",
            "compléments alimentaires",
            "complément nutritionnel",
            "compléments nutritionnels",
            "gélules de vitamines",
            "comprimés de vitamines",
            "comprimés de magnésium",
            "vitamine c en comprimés",
            "vitamine d en gouttes",
            "gélules oméga 3",
            "capsules oméga 3",
            "magnésium",
            "multivitamines",
            "vitamine c",
            "vitamine d",
            "vitamine d3",
            "vitamine b12",
            "oméga 3",
            "probiotiques",
        ],
    },
    StoreCategory {
        id: "premiers-soins",
        name: "Premiers soins",
        order_index: 96,
        icon: "bandage",
        keywords: &[
            "pansement",
            "pansements",
            "compresse stérile",
            "compresses stériles",
            "sparadrap",
            "bande de gaze",
            "bandes de gaze",
            "antiseptique",
            "désinfectant cutané",
            "désinfectant pour plaies",
            "sérum physiologique",
            "trousse de secours",
            "thermomètre médical",
        ],
    },
    StoreCategory {
        id: "entretien-maison",
        name: "Entretien maison",
        order_index: 100,
        icon: "spray-can",
        keywords: &[
            "lessive",
            "nettoyant",
            "vaisselle",
            "essuie-tout",
            "papier toilette",
            "menage",
            "ménage",
        ],
    },
    StoreCategory {
        id: "bebe",
        name: "Bébé",
        order_index: 110,
        icon: "baby",
        keywords: &["couche", "bebe", "bébé", "lingette", "petit pot"],
    },
    StoreCategory {
        id: "animaux",
        name: "Animaux",
        order_index: 120,
        icon: "paw-print",
        keywords: &["chat", "chien", "croquette", "litiere", "litière", "animal"],
    },
    StoreCategory {
        id: "papeterie-bureau",
        name: "Papeterie & fournitures de bureau",
        order_index: 130,
        icon: "notebook-pen",
        keywords: &[
            "papeterie",
            "fournitures scolaires",
            "fournitures de bureau",
            "stylo",
            "stylos",
            "crayon",
            "crayons",
            "cahier",
            "cahiers",
            "carnet",
            "carnets",
            "classeur",
            "classeurs",
            "agrafeuse",
            "agrafes",
            "trombone",
            "trombones",
            "papier imprimante",
            "papier a4",
            "imprimante",
            "enveloppe",
            "enveloppes",
            "feutre",
            "feutres",
            "gomme à effacer",
            "colle scolaire",
            "post-it",
        ],
    },
    StoreCategory {
        id: "bricolage-quincaillerie",
        name: "Bricolage & quincaillerie",
        order_index: 140,
        icon: "hammer",
        keywords: &[
            "bricolage",
            "quincaillerie",
            "vis",
            "écrou",
            "écrous",
            "boulon",
            "boulons",
            "cheville",
            "chevilles",
            "tournevis",
            "marteau",
            "pinceau",
            "pinceaux",
            "peinture",
            "perceuse",
            "ruban adhésif",
            "papier de verre",
            "clé à molette",
        ],
    },
    StoreCategory {
        id: "jardin-exterieur",
        name: "Jardin & extérieur",
        order_index: 150,
        icon: "sprout",
        keywords: &[
            "jardin",
            "jardinage",
            "terreau",
            "engrais",
            "semences",
            "graines à semer",
            "arrosoir",
            "sécateur",
            "râteau",
            "pelle de jardin",
            "pot de fleurs",
            "pots de fleurs",
            "plante verte",
            "plantes vertes",
            "tuyau d’arrosage",
            "tondeuse à gazon",
        ],
    },
    StoreCategory {
        id: "auto-moto",
        name: "Auto & moto",
        order_index: 160,
        icon: "car",
        keywords: &[
            "voiture",
            "voitures",
            "automobile",
            "moto",
            "motos",
            "pneu",
            "pneus",
            "lave-glace",
            "essuie-glace",
            "essuie-glaces",
            "huile moteur",
            "huile pour moteur",
            "liquide de refroidissement",
            "liquide de frein",
            "nettoyant jantes",
            "antigel",
            "batterie auto",
            "ampoule auto",
        ],
    },
    StoreCategory {
        id: "non-alimentaire",
        name: "Non alimentaire",
        order_index: 170,
        icon: "package",
        keywords: &["pile", "ampoule", "sac", "alu", "film alimentaire"],
    },
    StoreCategory {
        id: "soins-cheveux",
        name: "Soins des cheveux",
        order_index: 91,
        icon: "scissors",
        keywords: &[
            "shampooing",
            "shampoing",
            "après shampooing",
            "après shampoing",
            "masque cheveux",
            "coloration cheveux",
            "laque cheveux",
            "huile cheveux",
            "soin capillaire",
            "soins capillaires",
            "gel coiffant",
        ],
    },
    StoreCategory {
        id: "soins-visage-corps",
        name: "Soins du visage & du corps",
        order_index: 92,
        icon: "sparkles",
        keywords: &[
            "crème visage",
            "crème pour le visage",
            "crème mains",
            "crème pour les mains",
            "crème hydratante",
            "lait corporel",
            "lait de toilette",
            "gel douche",
            "savon",
            "déodorant",
            "protection solaire",
            "crème solaire",
            "baume à lèvres",
            "huile de massage",
            "sérum visage",
        ],
    },
    StoreCategory {
        id: "hygiene-dentaire",
        name: "Hygiène bucco-dentaire",
        order_index: 93,
        icon: "smile",
        keywords: &[
            "dentifrice",
            "brosse à dents",
            "brosses à dents",
            "bain de bouche",
            "bains de bouche",
            "fil dentaire",
            "solution dentaire",
        ],
    },
    StoreCategory {
        id: "maquillage-parfums",
        name: "Maquillage & parfums",
        order_index: 94,
        icon: "palette",
        keywords: &[
            "maquillage",
            "mascara",
            "rouge à lèvres",
            "fond de teint",
            "vernis à ongles",
            "démaquillant",
            "parfum",
            "eau de toilette",
            "eau de parfum",
            "pinceau maquillage",
            "pinceau de maquillage",
        ],
    },
    StoreCategory {
        id: "alimentation-animale",
        name: "Alimentation animale",
        order_index: 121,
        icon: "paw-print",
        keywords: &[
            "croquette",
            "croquettes",
            "pâtée pour chat",
            "pâtée pour chien",
            "friandises pour chat",
            "friandises pour chien",
            "friandises au poulet pour chat",
            "nourriture pour chat",
            "nourriture pour chien",
            "nourriture pour poissons",
            "graines pour oiseaux",
            "foin pour lapin",
        ],
    },
    StoreCategory {
        id: "accessoires-animaux",
        name: "Accessoires & hygiène des animaux",
        order_index: 122,
        icon: "paw-print",
        keywords: &[
            "litière",
            "gamelle",
            "gamelles",
            "laisse pour chien",
            "collier pour chien",
            "collier pour chat",
            "jouet pour chien",
            "jouet pour chat",
            "shampooing pour chien",
            "shampooing pour chat",
            "shampoing pour chien",
            "shampoing pour chat",
            "brosse pour chien",
            "brosse pour chat",
            "panier pour chien",
            "panier pour chat",
            "sacs à déjections",
        ],
    },
    StoreCategory {
        id: "maison-cuisine",
        name: "Maison & cuisine",
        order_index: 180,
        icon: "house",
        keywords: &[
            "casserole",
            "casseroles",
            "poêle de cuisson",
            "poêle à frire",
            "assiette",
            "assiettes",
            "couverts",
            "spatule",
            "passoire",
            "moule à gâteau",
            "boîte de conservation",
            "film alimentaire",
            "papier aluminium",
            "papier cuisson",
            "sac congélation",
            "sacs congélation",
            "verre à eau",
            "verres à eau",
        ],
    },
    StoreCategory {
        id: "vetements-linge",
        name: "Vêtements & linge",
        order_index: 190,
        icon: "shirt",
        keywords: &[
            "vêtement",
            "vêtements",
            "t shirt",
            "t shirts",
            "chaussette",
            "chaussettes",
            "pantalon",
            "pantalons",
            "chemise",
            "chemises",
            "chaussures",
            "linge de lit",
            "drap",
            "draps",
            "taie",
            "taies",
            "serviette de bain",
            "torchon",
            "torchons",
        ],
    },
    StoreCategory {
        id: "electricite-electronique",
        name: "Électricité & électronique",
        order_index: 200,
        icon: "plug",
        keywords: &[
            "pile",
            "piles",
            "ampoule",
            "ampoules",
            "chargeur",
            "chargeurs",
            "câble usb",
            "prise électrique",
            "multiprise",
            "écouteurs",
            "casque audio",
            "batterie externe",
            "ordinateur",
            "souris informatique",
            "clavier informatique",
        ],
    },
    StoreCategory {
        id: "jeux-loisirs",
        name: "Jeux & loisirs",
        order_index: 210,
        icon: "puzzle",
        keywords: &[
            "jouet",
            "jouets",
            "jeu de société",
            "jeux de société",
            "puzzle",
            "puzzles",
            "livre",
            "livres",
            "roman",
            "romans",
            "magazine",
            "magazines",
            "ballon de football",
            "ballon de basket",
            "raquette",
            "raquettes",
        ],
    },
    StoreCategory {
        id: "non-categorise",
        name: "À classer",
        order_index: 999,
        icon: "circle-help",
        keywords: &[],
    },
];

fn specialized(id: &str) -> bool {
    matches!(
        id,
        "papeterie-bureau"
            | "complements-alimentaires"
            | "premiers-soins"
            | "bricolage-quincaillerie"
            | "jardin-exterieur"
            | "auto-moto"
            | "soins-cheveux"
            | "soins-visage-corps"
            | "hygiene-dentaire"
            | "maquillage-parfums"
            | "alimentation-animale"
            | "accessoires-animaux"
            | "maison-cuisine"
            | "vetements-linge"
            | "electricite-electronique"
            | "jeux-loisirs"
    )
}

fn whole_words(input: &str) -> String {
    format!(
        " {} ",
        normalize(input)
            .split(|c: char| !c.is_alphanumeric())
            .filter(|word| !word.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    )
}

pub fn classify_product(product_name: &str, tags: &[String]) -> CategoryMatch {
    classify_with_source(product_name, tags, None)
}

fn classify_with_source(
    product_name: &str,
    tags: &[String],
    source: Option<&str>,
) -> CategoryMatch {
    #[derive(Deserialize)]
    struct TaxonomySnapshot {
        sources: HashMap<String, HashMap<String, Option<String>>>,
    }
    static TAXONOMIES: OnceLock<TaxonomySnapshot> = OnceLock::new();
    let taxonomies = TAXONOMIES.get_or_init(|| {
        serde_json::from_str(include_str!("catalogue_taxonomies.json"))
            .expect("valid compiled catalogue taxonomies")
    });
    let inherited: Vec<&str> = tags
        .iter()
        .flat_map(|tag| {
            taxonomies
                .sources
                .iter()
                .filter(move |(id, _)| source.is_none_or(|source| source == id.as_str()))
                .filter_map(move |(_, mapping)| {
                    mapping
                        .get(&tag.trim().to_lowercase())
                        .and_then(|id| id.as_deref())
                })
        })
        .collect();
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct TagRule {
        category_id: String,
        tags: Vec<String>,
    }
    static RULES: OnceLock<Vec<TagRule>> = OnceLock::new();
    let rules = RULES.get_or_init(|| {
        serde_json::from_str(include_str!("product_category_tags.json"))
            .expect("valid shared category mapping")
    });
    let known_tags: Vec<String> = tags.iter().map(|tag| normalize(tag.trim())).collect();
    let explicit = STORE_CATEGORIES.iter().find(|category| {
        category.id != "non-categorise"
            && known_tags
                .iter()
                .any(|tag| *tag == normalize(category.id) || *tag == normalize(category.name))
    });
    let mapped = rules
        .iter()
        .filter(|rule| {
            rule.category_id != "alcools"
                || !is_alcohol_free(&format!("{} {}", product_name, tags.join(" ")))
        })
        .find(|rule| {
            inherited.contains(&rule.category_id.as_str())
                || rule
                    .tags
                    .iter()
                    .any(|tag| known_tags.contains(&normalize(tag)))
        })
        .and_then(|rule| {
            STORE_CATEGORIES
                .iter()
                .find(|category| category.id == rule.category_id)
        });
    if let Some(category) = explicit.or(mapped) {
        return CategoryMatch {
            category_id: category.id.into(),
            category_name: category.name.into(),
            confidence: 0.95,
        };
    }
    let tagged = classify_words(&tags.join(" "));
    if tagged.category_id != "non-categorise" {
        return tagged;
    }
    classify_words(product_name)
}

pub fn classify_catalogue_product(name: &str, tags: &[String], source: &str) -> CategoryMatch {
    let (allowed, fallback): (&[&str], &str) = match source {
        "openbeautyfacts" => (
            &[
                "hygiene-beaute",
                "soins-cheveux",
                "soins-visage-corps",
                "hygiene-dentaire",
                "maquillage-parfums",
            ],
            "Hygiène & beauté",
        ),
        "openpetfoodfacts" => (
            &["animaux", "alimentation-animale", "accessoires-animaux"],
            "Alimentation animale",
        ),
        _ => return classify_with_source(name, tags, Some(source)),
    };
    let category = classify_with_source(name, tags, Some(source));
    if allowed.contains(&category.category_id.as_str())
        && !matches!(category.category_id.as_str(), "animaux" | "hygiene-beaute")
    {
        return category;
    }
    // A broad catalogue category may be refined by a precise name, only within its domain.
    let named = classify_words(name);
    if allowed.contains(&named.category_id.as_str()) {
        return named;
    }
    classify_product("", &[fallback.to_string()])
}

fn classify_words(value: &str) -> CategoryMatch {
    let haystack = normalize(value);

    // Match precise non-food terms before huile, glace, etc., without matching vis in visage.
    let words = whole_words(&haystack);
    let mut best = None;
    let mut best_score = 0;
    for category in STORE_CATEGORIES
        .iter()
        .filter(|category| specialized(category.id))
    {
        let score = category
            .keywords
            .iter()
            .filter(|keyword| {
                words.contains(&whole_words(keyword))
                    && (category.id != "complements-alimentaires"
                        || !matches!(
                            normalize(keyword).as_str(),
                            "magnesium"
                                | "multivitamines"
                                | "vitamine c"
                                | "vitamine d"
                                | "vitamine d3"
                                | "vitamine b12"
                                | "omega 3"
                                | "probiotiques"
                        )
                        || words == whole_words(keyword))
            })
            .map(|keyword| whole_words(keyword).chars().count())
            .max()
            .unwrap_or(0);
        if score > best_score {
            best = Some(category);
            best_score = score;
        }
    }
    if let Some(category) = best {
        return CategoryMatch {
            category_id: category.id.into(),
            category_name: category.name.into(),
            confidence: 0.82,
        };
    }

    if let Some(alcohol) = STORE_CATEGORIES.iter().find(|category| {
        category.id == "alcools"
            && !words.contains(" vinaigre ")
            && category
                .keywords
                .iter()
                .any(|keyword| words.contains(&whole_words(keyword)))
    }) {
        let category = if is_alcohol_free(value) {
            STORE_CATEGORIES
                .iter()
                .find(|category| category.id == "boissons")
                .unwrap()
        } else {
            alcohol
        };
        return CategoryMatch {
            category_id: category.id.into(),
            category_name: category.name.into(),
            confidence: 0.82,
        };
    }

    if let Some(category) = STORE_CATEGORIES.iter().find(|category| {
        category.id == "boissons"
            && category
                .keywords
                .iter()
                .any(|keyword| words.contains(&whole_words(keyword)))
    }) {
        return CategoryMatch {
            category_id: category.id.into(),
            category_name: category.name.into(),
            confidence: 0.82,
        };
    }

    for category in STORE_CATEGORIES.iter().filter(|category| {
        category.id != "non-categorise" && category.id != "alcools" && !specialized(category.id)
    }) {
        if category
            .keywords
            .iter()
            .any(|keyword| haystack.contains(&normalize(keyword)))
        {
            return CategoryMatch {
                category_id: category.id.to_string(),
                category_name: category.name.to_string(),
                confidence: 0.82,
            };
        }
    }

    let fallback = STORE_CATEGORIES
        .iter()
        .find(|category| category.id == "non-categorise")
        .expect("fallback category must exist");

    CategoryMatch {
        category_id: fallback.id.to_string(),
        category_name: fallback.name.to_string(),
        confidence: 0.2,
    }
}

fn is_alcohol_free(input: &str) -> bool {
    let value = normalize(input);
    if ["sans alcool", "non alcoholic", "alcohol free"]
        .iter()
        .any(|phrase| value.contains(phrase))
    {
        return true;
    }
    value
        .split('%')
        .take(value.matches('%').count())
        .any(|before| {
            let number = before
                .trim_end()
                .rsplit(|c: char| !c.is_ascii_digit() && c != '.' && c != ',')
                .next()
                .unwrap_or("");
            !number.is_empty()
                && number
                    .replace(',', ".")
                    .parse::<f64>()
                    .is_ok_and(|n| n == 0.0)
        })
}

fn normalize(input: &str) -> String {
    input
        .to_lowercase()
        .replace(['-', '_'], " ")
        .replace(['é', 'è', 'ê'], "e")
        .replace(['à', 'â', 'ä'], "a")
        .replace(['î', 'ï'], "i")
        .replace(['ô', 'ö'], "o")
        .replace(['ù', 'û', 'ü'], "u")
        .replace('ç', "c")
        .replace('œ', "oe")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Example {
        name: String,
        tags: Vec<String>,
        category_id: String,
    }

    #[test]
    fn taxonomy_mapping_matches_mobile() {
        let backend: serde_json::Value =
            serde_json::from_str(include_str!("product_category_tags.json")).unwrap();
        let mobile: serde_json::Value = serde_json::from_str(include_str!(
            "../../../mobile/src/services/categorization/productCategoryTags.json"
        ))
        .unwrap();
        assert_eq!(backend, mobile);
        let backend: serde_json::Value =
            serde_json::from_str(include_str!("catalogue_taxonomies.json")).unwrap();
        let mobile: serde_json::Value = serde_json::from_str(include_str!(
            "../../../mobile/src/services/categorization/catalogueTaxonomies.json"
        ))
        .unwrap();
        assert_eq!(backend, mobile);
    }

    #[test]
    fn shared_category_examples_match_mobile() {
        let examples: Vec<Example> = serde_json::from_str(include_str!(
            "../../../tests/fixtures/category-examples.json"
        ))
        .unwrap();
        for example in examples {
            assert_eq!(
                classify_product(&example.name, &example.tags).category_id,
                example.category_id,
                "{}",
                example.name
            );
        }
    }
}
