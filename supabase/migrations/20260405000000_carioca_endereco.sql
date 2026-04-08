-- Adiciona suporte a entrega com endereço na tabela carioca_orders
ALTER TABLE carioca_orders
  ADD COLUMN IF NOT EXISTS endereco       jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS taxa_entrega   numeric(10,2) NOT NULL DEFAULT 0;
