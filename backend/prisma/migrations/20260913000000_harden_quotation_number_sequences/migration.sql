-- This migration never updates quotation data or existing quotation numbers.
-- It only adds missing uniqueness guarantees required by atomic number allocation.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS idx
    WHERE idx.indrelid = '"quotation_sequences"'::regclass
      AND idx.indisunique
      AND idx.indnkeyatts = 2
      AND (
        SELECT array_agg(attribute.attname::text ORDER BY key_position.ordinality)
        FROM unnest(idx.indkey) WITH ORDINALITY AS key_position(attnum, ordinality)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = idx.indrelid
         AND attribute.attnum = key_position.attnum
        WHERE key_position.ordinality <= idx.indnkeyatts
      ) = ARRAY['prefix', 'year_month']
  ) THEN
    CREATE UNIQUE INDEX "quotation_sequences_prefix_year_month_key"
      ON "quotation_sequences"("prefix", "year_month");
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index AS idx
    WHERE idx.indrelid = '"quotations"'::regclass
      AND idx.indisunique
      AND idx.indnkeyatts = 1
      AND (
        SELECT array_agg(attribute.attname::text ORDER BY key_position.ordinality)
        FROM unnest(idx.indkey) WITH ORDINALITY AS key_position(attnum, ordinality)
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = idx.indrelid
         AND attribute.attnum = key_position.attnum
        WHERE key_position.ordinality <= idx.indnkeyatts
      ) = ARRAY['quotation_no']
  ) THEN
    CREATE UNIQUE INDEX "quotations_quotation_no_key"
      ON "quotations"("quotation_no");
  END IF;
END $$;
