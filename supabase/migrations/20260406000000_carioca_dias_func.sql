-- Adicionar colunas faltantes
ALTER TABLE carioca_store_state ADD COLUMN IF NOT EXISTS dias_funcionamento jsonb DEFAULT '[0,1,2,3,4,5,6]';
ALTER TABLE carioca_store_state ADD COLUMN IF NOT EXISTS taxa_entrega numeric(10,2) DEFAULT 0;
ALTER TABLE carioca_orders ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE carioca_orders ADD COLUMN IF NOT EXISTS endereco text;
ALTER TABLE carioca_orders ADD COLUMN IF NOT EXISTS taxa_entrega numeric(10,2) DEFAULT 0;
