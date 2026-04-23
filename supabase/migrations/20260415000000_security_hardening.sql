-- Security hardening migration
-- Adds senha_admin column for server-side authentication
-- Removes insecure default from senha_desconto

-- Add admin password column (must be set via Supabase dashboard or API)
ALTER TABLE carioca_store_state ADD COLUMN IF NOT EXISTS senha_admin text;

-- Remove insecure default '1234' from senha_desconto
-- The column will keep existing values but new rows won't get '1234'
ALTER TABLE carioca_store_state ALTER COLUMN senha_desconto DROP DEFAULT;
