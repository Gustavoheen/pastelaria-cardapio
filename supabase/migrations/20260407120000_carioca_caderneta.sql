-- CPF no cadastro de clientes
ALTER TABLE pastel.customers ADD COLUMN IF NOT EXISTS cpf text;

-- Tabela de caderneta (fiados)
CREATE TABLE IF NOT EXISTS pastel.caderneta (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id  uuid NOT NULL,
  descricao   text NOT NULL DEFAULT '',
  itens       jsonb NOT NULL DEFAULT '[]',
  valor       numeric(10,2) NOT NULL,
  pago        boolean NOT NULL DEFAULT false,
  data        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_caderneta_cliente ON pastel.caderneta (cliente_id);
CREATE INDEX IF NOT EXISTS idx_caderneta_pago ON pastel.caderneta (pago);
ALTER TABLE pastel.caderneta ENABLE ROW LEVEL SECURITY;
