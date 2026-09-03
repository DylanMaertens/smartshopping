use serde::Serialize;

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
            "pates", "pâtes", "riz", "huile", "sel", "conserve", "sauce", "chips", "farine",
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
        id: "non-alimentaire",
        name: "Non alimentaire",
        order_index: 130,
        icon: "package",
        keywords: &["pile", "ampoule", "sac", "alu", "film alimentaire"],
    },
    StoreCategory {
        id: "non-categorise",
        name: "À classer",
        order_index: 999,
        icon: "circle-help",
        keywords: &[],
    },
];

pub fn classify_product(product_name: &str, tags: &[String]) -> CategoryMatch {
    let haystack = normalize(&format!("{} {}", product_name, tags.join(" ")));

    for category in STORE_CATEGORIES
        .iter()
        .filter(|category| category.id != "non-categorise")
    {
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

fn normalize(input: &str) -> String {
    input
        .to_lowercase()
        .replace(['-', '_'], " ")
        .replace(['é', 'è', 'ê'], "e")
        .replace('à', "a")
        .replace('ç', "c")
        .replace('œ', "oe")
}
