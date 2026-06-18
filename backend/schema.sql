-- toolboy discovery index (D1).
-- Apply locally:  wrangler d1 execute toolboy-index --local  --file schema.sql
-- Apply remote:   wrangler d1 execute toolboy-index --remote --file schema.sql

CREATE TABLE IF NOT EXISTS entities (
  id          TEXT NOT NULL,            -- entity id within its repo
  source      TEXT NOT NULL,            -- source spec the client loads (gh:owner/repo@ref)
  kind        TEXT NOT NULL,            -- 'tool' | 'toolchain'
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT 'box',
  tags        TEXT NOT NULL DEFAULT '[]', -- JSON array string
  repo_name   TEXT NOT NULL DEFAULT '',
  pin         TEXT NOT NULL,            -- commit the card was indexed at
  indexed_at  INTEGER NOT NULL,         -- epoch ms
  -- same entity id can exist in different repos; one row per (source, id)
  PRIMARY KEY (source, id)
);

-- discover() filters with LIKE over name/description/tags, then orders by name
CREATE INDEX IF NOT EXISTS entities_name ON entities (name);
