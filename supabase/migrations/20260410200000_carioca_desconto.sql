-- Colunas dedicadas de desconto nos pedidos
ALTER TABLE carioca_orders ADD COLUMN IF NOT EXISTS desconto_tipo  text;          -- 'valor', 'porcentagem', null
ALTER TABLE carioca_orders ADD COLUMN IF NOT EXISTS desconto_valor numeric(10,2); -- valor em R$ do desconto aplicado
ALTER TABLE carioca_orders ADD COLUMN IF NOT EXISTS desconto_pct   numeric(5,2);  -- % aplicado (se tipo=porcentagem)
ALTER TABLE carioca_orders ADD COLUMN IF NOT EXISTS desconto_obs   text;          -- motivo informado pelo operador
ALTER TABLE carioca_orders ADD COLUMN IF NOT EXISTS origem         text;          -- 'balcao', 'site', 'app'

-- Senha de desconto configurável pelo admin
ALTER TABLE carioca_store_state ADD COLUMN IF NOT EXISTS senha_desconto text NOT NULL DEFAULT '1234';
