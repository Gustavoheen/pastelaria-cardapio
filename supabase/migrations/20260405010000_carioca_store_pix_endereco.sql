-- Adiciona campos de Pix e endereço da loja em carioca_store_state
ALTER TABLE carioca_store_state
  ADD COLUMN IF NOT EXISTS pix_chave   text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pix_tipo    text DEFAULT 'Telefone',
  ADD COLUMN IF NOT EXISTS pix_nome    text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS endereco_loja text DEFAULT NULL;
