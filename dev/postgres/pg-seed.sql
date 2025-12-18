-- Seed data for Translation Proxy
-- Migrated from HOST_SETTINGS in src/config.ts

-- ============================================
-- Default user
-- ============================================

INSERT INTO "user" (email, name)
VALUES ('wwilliams@esnipe.com', 'Winston Williams');

-- ============================================
-- Origin: www.esnipe.com
-- ============================================

INSERT INTO origin (user_id, domain, origin_lang)
VALUES (1, 'www.esnipe.com', 'en');

-- ============================================
-- Hosts (from HOST_SETTINGS)
-- ============================================

-- Spanish translation host
INSERT INTO host (
  origin_id,
  hostname,
  target_lang,
  skip_words,
  skip_patterns,
  skip_path,
  translate_path,
  proxied_cache,
  enabled
) VALUES (
  1,
  'es.esnipe.com',
  'es',
  ARRAY['eSnipe', 'eBay'],
  ARRAY['pii', 'numeric'],
  ARRAY[]::TEXT[],
  TRUE,
  5,
  TRUE
);

-- French translation host
INSERT INTO host (
  origin_id,
  hostname,
  target_lang,
  skip_words,
  skip_patterns,
  skip_path,
  translate_path,
  proxied_cache,
  enabled
) VALUES (
  1,
  'fr.esnipe.com',
  'fr',
  ARRAY['eSnipe', 'eBay'],
  ARRAY['pii', 'numeric'],
  ARRAY[]::TEXT[],
  TRUE,
  10,
  TRUE
);

-- Localhost development host
-- skip_path patterns: 'includes:' for substring match, 'regex:' for regex
INSERT INTO host (
  origin_id,
  hostname,
  target_lang,
  skip_words,
  skip_patterns,
  skip_path,
  translate_path,
  proxied_cache,
  enabled
) VALUES (
  1,
  'localhost',
  'es',
  ARRAY['eSnipe', 'eBay'],
  ARRAY['pii', 'numeric'],
  ARRAY['includes:/api/', 'regex:^/admin'],
  TRUE,
  0,
  TRUE
);
