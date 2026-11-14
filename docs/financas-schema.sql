PRAGMA foreign_keys = ON;

-- Tabela de tarefas (espelha o objeto "task" atual do Vivaro; hoje vive em localStorage)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
  category TEXT NOT NULL CHECK (category IN ('pessoal','profissional')),
  quadrant INTEGER NOT NULL CHECK (quadrant BETWEEN 1 AND 4),
  status TEXT NOT NULL, due_at TEXT, completed_at TEXT, created_at TEXT NOT NULL,
  payload_json TEXT            -- lembretes, subtarefas, anexos… (JSON)
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('corrente','poupanca','carteira')),
  opening_cents INTEGER NOT NULL DEFAULT 0,          -- saldo inicial em centavos
  currency TEXT NOT NULL DEFAULT 'EUR', archived INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE cards (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  limit_cents INTEGER NOT NULL CHECK (limit_cents >= 0),
  closing_day INTEGER NOT NULL CHECK (closing_day BETWEEN 1 AND 31),
  due_day INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  pay_account_id TEXT REFERENCES accounts(id)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('income','expense')),
  parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE      -- subcategoria
);

CREATE TABLE recurrences (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  description TEXT, category_id TEXT REFERENCES categories(id),
  account_id TEXT REFERENCES accounts(id), to_account_id TEXT REFERENCES accounts(id),
  card_id TEXT REFERENCES cards(id),
  freq TEXT NOT NULL CHECK (freq IN ('weekly','monthly','yearly')),
  start_date TEXT NOT NULL, end_date TEXT
);

CREATE TABLE installment_groups (        -- compra parcelada
  id TEXT PRIMARY KEY, total_cents INTEGER NOT NULL CHECK (total_cents > 0), parts INTEGER NOT NULL CHECK (parts > 1)
);

-- Uma única tabela de lançamentos. Datas em ISO (yyyy-mm-dd). Valores SEMPRE positivos; o sinal vem do "type".
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer','card_payment')),
  status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('done','planned')),  -- efetivado | previsto
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  date TEXT NOT NULL,
  description TEXT,
  category_id TEXT REFERENCES categories(id),
  account_id TEXT REFERENCES accounts(id),       -- origem (receita/despesa em conta/transferência/pagamento)
  to_account_id TEXT REFERENCES accounts(id),    -- destino (só transferência)
  card_id TEXT REFERENCES cards(id),             -- compra no cartão ou pagamento de fatura
  invoice_month TEXT,                            -- 'yyyy-mm' da fatura em que a compra cai
  installment_group_id TEXT REFERENCES installment_groups(id) ON DELETE CASCADE,
  installment_no INTEGER, recurrence_id TEXT REFERENCES recurrences(id) ON DELETE SET NULL,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,   -- ligação opcional a uma tarefa (lembrete de pagamento)
  CHECK (type <> 'transfer' OR (account_id IS NOT NULL AND to_account_id IS NOT NULL AND account_id <> to_account_id)),
  CHECK (type <> 'expense' OR (account_id IS NOT NULL) <> (card_id IS NOT NULL)),   -- despesa: conta XOR cartão
  CHECK (type <> 'card_payment' OR (card_id IS NOT NULL AND account_id IS NOT NULL AND invoice_month IS NOT NULL))
);
CREATE INDEX idx_tx_date ON transactions(date);
CREATE INDEX idx_tx_account ON transactions(account_id, status);
CREATE INDEX idx_tx_card_inv ON transactions(card_id, invoice_month);
CREATE UNIQUE INDEX idx_tx_rec_once ON transactions(recurrence_id, date) WHERE recurrence_id IS NOT NULL;

CREATE TABLE budgets (id TEXT PRIMARY KEY, category_id TEXT NOT NULL UNIQUE REFERENCES categories(id) ON DELETE CASCADE, limit_cents INTEGER NOT NULL CHECK (limit_cents > 0));
CREATE TABLE goals (id TEXT PRIMARY KEY, name TEXT NOT NULL, target_cents INTEGER NOT NULL CHECK (target_cents > 0), deadline TEXT);
CREATE TABLE goal_deposits (id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE, date TEXT NOT NULL, amount_cents INTEGER NOT NULL);  -- negativo = retirada

-- ========================= VIEWS (regras de negócio) =========================

-- Efeito de cada lançamento em cada conta (em centavos, com sinal). Compras no cartão NÃO tocam em contas.
CREATE VIEW v_account_effects AS
  SELECT id AS tx_id, account_id AS acc, status, date,
         CASE type WHEN 'income' THEN amount_cents WHEN 'expense' THEN -amount_cents
                   WHEN 'transfer' THEN -amount_cents WHEN 'card_payment' THEN -amount_cents END AS delta
    FROM transactions WHERE account_id IS NOT NULL
  UNION ALL
  SELECT id, to_account_id, status, date, amount_cents FROM transactions WHERE type = 'transfer';

-- Saldo ATUAL (efetivado) por conta
CREATE VIEW v_balance_current AS
  SELECT a.id AS account_id, a.name,
         a.opening_cents + COALESCE(SUM(CASE WHEN e.status = 'done' THEN e.delta END), 0) AS balance_cents
    FROM accounts a LEFT JOIN v_account_effects e ON e.acc = a.id GROUP BY a.id;

-- Faturas: total comprado, pago e em aberto por cartão/mês
CREATE VIEW v_invoices AS
  SELECT card_id, invoice_month,
         SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) AS total_cents,
         SUM(CASE WHEN type = 'card_payment' AND status = 'done' THEN amount_cents ELSE 0 END) AS paid_cents,
         SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END)
       - SUM(CASE WHEN type = 'card_payment' AND status = 'done' THEN amount_cents ELSE 0 END) AS open_cents
    FROM transactions WHERE card_id IS NOT NULL GROUP BY card_id, invoice_month;

-- Resultado do mês (receitas/despesas): ignora transferências e pagamentos de fatura ⇒ sem dupla contagem
CREATE VIEW v_month_result AS
  SELECT substr(date,1,7) AS month,
         SUM(CASE WHEN type='income'  AND status='done' THEN amount_cents ELSE 0 END) AS income_done_cents,
         SUM(CASE WHEN type='expense' AND status='done' THEN amount_cents ELSE 0 END) AS expense_done_cents,
         SUM(CASE WHEN type='income'  THEN amount_cents ELSE 0 END) AS income_all_cents,
         SUM(CASE WHEN type='expense' THEN amount_cents ELSE 0 END) AS expense_all_cents
    FROM transactions WHERE type IN ('income','expense') GROUP BY substr(date,1,7);

-- Limite usado do cartão = compras (incl. parcelas futuras) − pagamentos efetivados
CREATE VIEW v_card_used AS
  SELECT c.id AS card_id, c.limit_cents,
         MAX(0, COALESCE(SUM(CASE WHEN t.type='expense' THEN t.amount_cents WHEN t.type='card_payment' AND t.status='done' THEN -t.amount_cents END),0)) AS used_cents
    FROM cards c LEFT JOIN transactions t ON t.card_id = c.id GROUP BY c.id;
