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
  origem      text,
  endereco    text,
  taxa_entrega numeric(10,2) DEFAULT 0,
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
  pix_chave           text,
  pix_tipo            text DEFAULT 'Telefone',
  pix_nome            text,
  endereco_loja       text,
  combos              jsonb NOT NULL DEFAULT '[]',
  dias_funcionamento  jsonb DEFAULT '[0,1,2,3,4,5,6]',
  taxa_entrega        numeric(10,2) DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS carioca_customers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefone        text NOT NULL UNIQUE,
  nome            text NOT NULL,
  total_pedidos   integer NOT NULL DEFAULT 0,
  enderecos       jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

INSERT INTO carioca_store_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS carioca_orders_status_idx   ON carioca_orders (status);
CREATE INDEX IF NOT EXISTS carioca_orders_telefone_idx ON carioca_orders (telefone);
CREATE INDEX IF NOT EXISTS carioca_orders_created_idx  ON carioca_orders (created_at DESC);
CREATE INDEX IF NOT EXISTS carioca_estoque_ativo_idx   ON carioca_estoque (ativo);
CREATE INDEX IF NOT EXISTS carioca_customers_telefone_idx ON carioca_customers (telefone);
CREATE INDEX IF NOT EXISTS carioca_customers_updated_idx ON carioca_customers (updated_at DESC);

-- Row Level Security
ALTER TABLE carioca_orders      ENABLE ROW LEVEL SECURITY;
ALTER TABLE carioca_store_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE carioca_estoque     ENABLE ROW LEVEL SECURITY;
ALTER TABLE carioca_customers   ENABLE ROW LEVEL SECURITY;

-- Nenhum acesso anônimo — tudo via service key pela API
CREATE POLICY IF NOT EXISTS "no_anon_carioca_orders" ON carioca_orders
  FOR ALL TO anon USING (false);

CREATE POLICY IF NOT EXISTS "no_anon_carioca_state" ON carioca_store_state
  FOR ALL TO anon USING (false);

CREATE POLICY IF NOT EXISTS "no_anon_carioca_estoque" ON carioca_estoque
  FOR ALL TO anon USING (false);

CREATE POLICY IF NOT EXISTS "no_anon_carioca_customers" ON carioca_customers
  FOR ALL TO anon USING (false);
