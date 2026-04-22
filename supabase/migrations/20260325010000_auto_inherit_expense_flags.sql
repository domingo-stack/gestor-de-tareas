-- Auto-inherit is_fixed_expense and is_cac_related flags for new transactions
-- When a new transaction is inserted, if there's an existing transaction with the
-- same (description, category_id) that has flags set, copy them automatically.

CREATE OR REPLACE FUNCTION fn_inherit_expense_flags()
RETURNS TRIGGER AS $$
BEGIN
  -- Only act if both flags are not already set
  IF NEW.is_fixed_expense = true OR NEW.is_cac_related = true THEN
    RETURN NEW;
  END IF;

  -- Skip if no description or category
  IF NEW.description IS NULL OR NEW.category_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look for an existing transaction with matching description+category that has flags
  SELECT
    COALESCE(bool_or(is_fixed_expense), false),
    COALESCE(bool_or(is_cac_related), false)
  INTO NEW.is_fixed_expense, NEW.is_cac_related
  FROM fin_transactions
  WHERE description = NEW.description
    AND category_id = NEW.category_id
    AND id != NEW.id
    AND (is_fixed_expense = true OR is_cac_related = true)
  LIMIT 1;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (safe re-run)
DROP TRIGGER IF EXISTS trg_inherit_expense_flags ON fin_transactions;

-- Create trigger on INSERT
CREATE TRIGGER trg_inherit_expense_flags
  BEFORE INSERT ON fin_transactions
  FOR EACH ROW
  EXECUTE FUNCTION fn_inherit_expense_flags();

-- Also propagate flags to existing transactions that are missing them
-- (fix current data: if ANY transaction with same desc+cat has the flag, set it for all)
UPDATE fin_transactions t
SET is_fixed_expense = true
FROM (
  SELECT DISTINCT description, category_id
  FROM fin_transactions
  WHERE is_fixed_expense = true
    AND description IS NOT NULL
    AND category_id IS NOT NULL
) flagged
WHERE t.description = flagged.description
  AND t.category_id = flagged.category_id
  AND t.is_fixed_expense IS NOT TRUE;

UPDATE fin_transactions t
SET is_cac_related = true
FROM (
  SELECT DISTINCT description, category_id
  FROM fin_transactions
  WHERE is_cac_related = true
    AND description IS NOT NULL
    AND category_id IS NOT NULL
) flagged
WHERE t.description = flagged.description
  AND t.category_id = flagged.category_id
  AND t.is_cac_related IS NOT TRUE;
