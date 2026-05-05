export const sqliteSchema = `
CREATE TABLE IF NOT EXISTS shopping_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  synced_at INTEGER
);

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL,
  name TEXT NOT NULL,
  barcode TEXT,
  category TEXT,
  quantity INTEGER DEFAULT 1,
  checked INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (list_id) REFERENCES shopping_lists(id) ON DELETE CASCADE
);
`;
