# Word Count Function and Triggers

Automatically calculates `word_count` for `translated_segment` and `translated_path` tables.

## Language Support

| Language Group | Method |
|---------------|--------|
| Latin-based (English, Spanish, French, German, etc.) | Punctuation stripped, whitespace split |
| Cyrillic (Russian, Ukrainian, etc.) | Punctuation stripped, whitespace split |
| Greek, Arabic, Hebrew, Indic scripts | Punctuation stripped, whitespace split |
| Chinese (Simplified & Traditional) | Character count |
| Japanese (Hiragana, Katakana, Kanji) | Character count |
| Korean (Hangul) | Character count |
| Thai, Lao, Khmer, Myanmar | Character count |

## SQL

```sql
--
-- Word count function and triggers for translated_segment and translated_path
--

-- Function to count words in text (handles Unicode and CJK/Southeast Asian scripts)
-- For space-delimited languages: strips punctuation, splits on whitespace
-- For character-based languages (Chinese, Japanese, Korean, Thai, etc.): counts characters
CREATE OR REPLACE FUNCTION calculate_word_count(input_text text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  cleaned text;
  char_count integer;
  word_count integer;
  -- Character-based languages (no spaces between words):
  -- CJK: Chinese (\u4e00-\u9fff, \u3400-\u4dbf), Japanese Hiragana/Katakana (\u3040-\u30ff), Korean (\uac00-\ud7af)
  -- Southeast Asian: Thai (\u0e00-\u0e7f), Lao (\u0e80-\u0eff), Khmer (\u1780-\u17ff), Myanmar (\u1000-\u109f)
  char_langs_pattern text := '[\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0e00-\u0e7f\u0e80-\u0eff\u1780-\u17ff\u1000-\u109f]';
  char_langs_negated text := '[^\u4e00-\u9fff\u3400-\u4dbf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af\u0e00-\u0e7f\u0e80-\u0eff\u1780-\u17ff\u1000-\u109f]+';
BEGIN
  IF input_text IS NULL OR input_text = '' THEN
    RETURN 0;
  END IF;

  -- Count characters from non-space-delimited languages
  char_count := length(regexp_replace(input_text, char_langs_negated, '', 'g'));

  -- For space-delimited languages: remove character-based scripts, strip punctuation, count words
  cleaned := regexp_replace(input_text, char_langs_pattern, '', 'g');
  -- Replace non-alphanumeric chars with space (handles punctuation like : / - etc.)
  cleaned := regexp_replace(cleaned, '[^[:alnum:]]+', ' ', 'g');
  cleaned := trim(cleaned);

  IF cleaned = '' THEN
    word_count := 0;
  ELSE
    word_count := array_length(string_to_array(cleaned, ' '), 1);
  END IF;

  RETURN char_count + word_count;
END;
$$;

-- Trigger function for translated_segment
CREATE OR REPLACE FUNCTION set_translated_segment_word_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.word_count := calculate_word_count(NEW.translated_text);
  RETURN NEW;
END;
$$;

-- Trigger function for translated_path
CREATE OR REPLACE FUNCTION set_translated_path_word_count()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.word_count := calculate_word_count(NEW.translated_path);
  RETURN NEW;
END;
$$;

-- Drop existing triggers if they exist (for idempotent runs)
DROP TRIGGER IF EXISTS translated_segment_word_count ON translated_segment;
DROP TRIGGER IF EXISTS translated_path_word_count ON translated_path;

-- Create triggers (fire on INSERT or when translated text changes)
CREATE TRIGGER translated_segment_word_count
  BEFORE INSERT OR UPDATE OF translated_text ON translated_segment
  FOR EACH ROW
  EXECUTE FUNCTION set_translated_segment_word_count();

CREATE TRIGGER translated_path_word_count
  BEFORE INSERT OR UPDATE OF translated_path ON translated_path
  FOR EACH ROW
  EXECUTE FUNCTION set_translated_path_word_count();
```

## Backfill Existing Data

Run once after creating the function and triggers to populate missing values:

```sql
UPDATE translated_segment
SET word_count = calculate_word_count(translated_text)
WHERE word_count IS NULL;

UPDATE translated_path
SET word_count = calculate_word_count(translated_path)
WHERE word_count IS NULL;
```

To recalculate all rows (e.g., after updating the function):

```sql
UPDATE translated_segment
SET word_count = calculate_word_count(translated_text);

UPDATE translated_path
SET word_count = calculate_word_count(translated_path);
```
