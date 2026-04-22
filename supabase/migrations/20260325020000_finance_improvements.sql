-- Agregar account_id a transacciones para vincular con cuentas bancarias
ALTER TABLE fin_transactions
  ADD COLUMN IF NOT EXISTS account_id INT REFERENCES fin_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_transactions_account
  ON fin_transactions(account_id);
