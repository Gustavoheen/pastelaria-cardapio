-- Adiciona vencimento por entrada e limite de crédito por cliente

ALTER TABLE pastel.caderneta
  ADD COLUMN IF NOT EXISTS vencimento date;

ALTER TABLE pastel.customers
  ADD COLUMN IF NOT EXISTS limite_credito numeric(10,2);
