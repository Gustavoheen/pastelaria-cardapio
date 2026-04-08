-- Criar tabela carioca_customers
CREATE TABLE IF NOT EXISTS carioca_customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone        text NOT NULL UNIQUE,
  nome            text NOT NULL,
  total_pedidos   integer NOT NULL DEFAULT 0,
  enderecos       jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carioca_customers_telefone_idx ON carioca_customers (telefone);
CREATE INDEX IF NOT EXISTS carioca_customers_updated_idx ON carioca_customers (updated_at DESC);

ALTER TABLE carioca_customers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "no_anon_carioca_customers" ON carioca_customers FOR ALL TO anon USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
