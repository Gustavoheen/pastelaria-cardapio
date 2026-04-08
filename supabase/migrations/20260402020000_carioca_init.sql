-- Pastel do Carioca — Schema
-- Executar no banco scooby-lanches (mesmo Supabase projeto)

CREATE TABLE IF NOT EXISTS carioca_orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero      text NOT NULL UNIQUE,
  nome        text NOT NULL,
  telefone    text,
  tipo_entrega text NOT NULL DEFAULT 'retirada',
  pagamento   text NOT NULL,
  troco       numeric(10,2),
  itens       jsonb NOT NULL DEFAULT '[]',
  subtotal    numeric(10,2) NOT NULL DEFAULT 0,
  total       numeric(10,2) NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'recebido',
  observacao  text,
  data        text,
  hora        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS carioca_store_state (
  id                  integer PRIMARY KEY DEFAULT 1,
  status              text NOT NULL DEFAULT 'auto',
  horario_abertura    text NOT NULL DEFAULT '10:00',
  horario_fechamento  text NOT NULL DEFAULT '22:00',
  whatsapp            text,
  desativados         jsonb NOT NULL DEFAULT '[]',
  precos              jsonb NOT NULL DEFAULT '{}',
  especial_ativo      boolean NOT NULL DEFAULT false,
  especial_nome       text NOT NULL DEFAULT 'X-Tudão',
  especial_descricao  text NOT NULL DEFAULT 'Contém TUDO — todos os sabores!',
  especial_preco      numeric(10,2) NOT NULL DEFAULT 35.00,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carioca_single_row CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS carioca_estoque (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  categoria       text NOT NULL DEFAULT 'geral',
  quantidade      integer NOT NULL DEFAULT 0,
  unidade         text NOT NULL DEFAULT 'un',
  preco_custo     numeric(10,2),
  alerta_minimo   integer NOT NULL DEFAULT 5,
  produto_id      text,
  ativo           boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO carioca_store_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS carioca_orders_status_idx   ON carioca_orders (status);
CREATE INDEX IF NOT EXISTS carioca_orders_telefone_idx ON carioca_orders (telefone);
CREATE INDEX IF NOT EXISTS carioca_orders_created_idx  ON carioca_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS carioca_estoque_ativo_idx   ON carioca_estoque (ativo);

-- Row Level Security
ALTER TABLE carioca_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE carioca_store_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE carioca_estoque     ENABLE ROW LEVEL SECURITY;

-- Nenhum acesso anônimo — tudo via service key pela API
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'no_anon_carioca_orders' AND tablename = 'carioca_orders') THEN
    CREATE POLICY "no_anon_carioca_orders" ON carioca_orders FOR ALL TO anon USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'no_anon_carioca_state' AND tablename = 'carioca_store_state') THEN
    CREATE POLICY "no_anon_carioca_state" ON carioca_store_state FOR ALL TO anon USING (false);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'no_anon_carioca_estoque' AND tablename = 'carioca_estoque') THEN
    CREATE POLICY "no_anon_carioca_estoque" ON carioca_estoque FOR ALL TO anon USING (false);
  END IF;
END $$;
