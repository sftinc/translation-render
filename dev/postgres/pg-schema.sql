-- PostgreSQL Schema for Translation Proxy
-- Migrated from D1 (SQLite) schema in db.md

-- ============================================
-- TRIGGER FUNCTION: Auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TABLE: user
-- ============================================

CREATE TABLE "user" (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER user_updated_at
  BEFORE UPDATE ON "user"
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABLE: origin
-- ============================================

CREATE TABLE origin (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES "user"(id) ON DELETE CASCADE,
  domain TEXT UNIQUE NOT NULL,
  origin_lang TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_origin_user_id ON origin(user_id);

CREATE TRIGGER origin_updated_at
  BEFORE UPDATE ON origin
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABLE: host
-- ============================================

CREATE TABLE host (
  id SERIAL PRIMARY KEY,
  origin_id INTEGER REFERENCES origin(id) ON DELETE CASCADE,
  hostname TEXT UNIQUE NOT NULL,
  target_lang TEXT NOT NULL,
  skip_words TEXT[],
  skip_patterns TEXT[],
  skip_path TEXT[],
  translate_path BOOLEAN DEFAULT TRUE,
  proxied_cache INTEGER DEFAULT 0,
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_host_origin_id ON host(origin_id);

CREATE TRIGGER host_updated_at
  BEFORE UPDATE ON host
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABLE: pathname
-- ============================================

CREATE TABLE pathname (
  id SERIAL PRIMARY KEY,
  host_id INTEGER REFERENCES host(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  translated_path TEXT NOT NULL,
  hit_count INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(host_id, path)
);

CREATE INDEX idx_pathname_host_translated ON pathname(host_id, translated_path);

-- ============================================
-- TABLE: translation
-- ============================================

CREATE TABLE translation (
  id SERIAL PRIMARY KEY,
  host_id INTEGER REFERENCES host(id) ON DELETE CASCADE,
  original_text TEXT NOT NULL,
  translated_text TEXT NOT NULL,
  kind TEXT,
  text_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(host_id, text_hash)
);

CREATE INDEX idx_translation_search ON translation(host_id, original_text);

CREATE TRIGGER translation_updated_at
  BEFORE UPDATE ON translation
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- TABLE: pathname_translation (junction)
-- ============================================

CREATE TABLE pathname_translation (
  id SERIAL PRIMARY KEY,
  pathname_id INTEGER REFERENCES pathname(id) ON DELETE CASCADE,
  translation_id INTEGER REFERENCES translation(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(pathname_id, translation_id)
);

CREATE INDEX idx_pathname_translation_pathname ON pathname_translation(pathname_id);
CREATE INDEX idx_pathname_translation_reverse ON pathname_translation(translation_id);
