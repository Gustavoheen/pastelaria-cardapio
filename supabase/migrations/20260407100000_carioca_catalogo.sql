-- Catálogo de itens diversos do Balcão (Pastel do Carioca)
CREATE TABLE IF NOT EXISTS pastel.catalogo (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  preco      numeric(10,2) NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pastel.catalogo ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'pastel' AND tablename = 'catalogo' AND policyname = 'no_anon_catalogo'
  ) THEN
    CREATE POLICY "no_anon_catalogo" ON pastel.catalogo
      FOR ALL TO anon USING (false);
  END IF;
END $$;
