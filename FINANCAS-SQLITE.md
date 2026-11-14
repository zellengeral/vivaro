# Vivaro · Módulo Financeiro — modelo SQLite, regras e backup

> **Estado real hoje:** o Vivaro guarda tudo em `localStorage` (tarefas `vivaro:tasks`, saúde `vivaro:health:v1`, finanças `vivaro:finance:v1`). **Ainda não existe SQLite nem tabela `tasks`.** O módulo já implementado usa exatamente o modelo abaixo (mesmos campos, em JSON), por isso migrar para SQLite é mecânico. O DDL desta página foi executado e testado com SQLite 3.53.

## 1. Valores monetários: inteiros em centavos
`REAL`/`FLOAT` não representam 0,10 exatamente (0,1+0,2 ≠ 0,3). Por isso **todo valor é `INTEGER` em centavos** (12,50 € → `1250`). Somas e comparações são exatas; só se formata na apresentação (`Intl.NumberFormat`). Regras:
- `amount_cents` é sempre **positivo**; o sinal vem do `type` (receita +, despesa −, transferência −origem/+destino).
- Parcelamento divide em centavos: 100,00 em 3x → 33,34 + 33,33 + 33,33 (o resto vai à 1.ª parcela, a soma fecha sempre).
- Conversão de entrada: `toCents("1.234,56") = 123456` (aceita vírgula/ponto).
- Datas em texto ISO `yyyy-mm-dd` (sem fuso), meses `yyyy-mm`.

## 2. Relação com tarefas
Unificado por **ligação opcional**: `transactions.task_id → tasks.id` (`ON DELETE SET NULL`). Um lançamento *previsto* pode criar uma tarefa "Pagar: …" com data e lembrete de 1 dia (já implementado na caixa "Criar tarefa com lembrete"). Não se mistura dinheiro na tabela de tarefas: as duas entidades continuam independentes e o `task_id` só liga um lembrete ao pagamento.

## 3. DDL completo e views
```sql
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
```

## 4. Regras críticas (resumo)
**Cartão sem dupla contagem.** A compra é uma `expense` com `card_id` e `account_id` NULO: conta como despesa **no dia da compra** (competência/orçamento) mas **não mexe em nenhuma conta**. Calcula-se o `invoice_month` pelo dia de fecho (compra depois do fecho vai para a fatura seguinte). Ao pagar, cria-se um `card_payment`: **sai da conta** mas **não entra em receitas/despesas** (`v_month_result` só soma `income`/`expense`). Limite usado = compras − pagamentos (`v_card_used`), por isso as parcelas futuras já ocupam limite.

**Transferências.** Um único lançamento `transfer` com `account_id` (origem) e `to_account_id` (destino): `v_account_effects` gera −valor numa conta e +valor na outra (soma zero no consolidado) e fica fora de `v_month_result`.

**Saldo atual vs. previsto.** Atual = saldo inicial + efeitos com `status='done'` (`v_balance_current`). Previsto até uma data = atual + efeitos `planned` até essa data (exceto compras de cartão) − faturas em aberto que vencem até essa data (query validada: no teste, 235 000 − 50 000 = 185 000). Vencimento da fatura: se `due_day > closing_day` é no mesmo mês, senão no seguinte. Recorrências: `recurrences` gera ocorrências `planned` (13 meses à frente, índice único `(recurrence_id,date)` impede duplicados).

## 5. Backup e restauro unificados (tarefas + finanças)
**Já implementado (v1.4.0):** Backup → um único `.json` versão 4:
```json
{ "app":"Vivaro","version":4,"exportedAt":"…","tasks":[…],"health":{…},"finance":{…} }
```
- Android: grava em cache com `@capacitor/filesystem` e abre a folha de partilha (`@capacitor/share`) — Drive, Ficheiros, e-mail. Web: download direto.
- Restauro: escolher o `.json` → valida → **junta por `id`** (nunca duplica nem apaga nada); ficheiros antigos (v1–v3) continuam a importar.

**Quando migrar para SQLite** (`@capacitor-community/sqlite`):
1. *Exportar:* `db.exportToJson("full")` devolve `{database, version, tables:[{name, schema, values}]}`. Gravar com `Filesystem.writeFile({path, data, directory: Directory.Cache})` e partilhar com `Share.share({files:[uri]})`. Incluir `PRAGMA user_version` para versionar o esquema.
2. *Importar:* `isJsonValid(json)` → `importFromJson(json)` (modo `full` substitui a base; `partial` faz *upsert* por chave primária = o comportamento de "juntar"). Antes, fazer **cópia de segurança automática** (`exportToJson` para `Directory.Data/backups/pre-restore-<data>.json`).
3. *Segurança do restauro:* validar `version`/`app`, correr dentro de transação (`BEGIN … COMMIT`, `ROLLBACK` em erro), `PRAGMA foreign_key_check` no fim, e recalcular `invoice_month` das compras de cartão se o dia de fecho mudou.
4. *Migração localStorage → SQLite (uma vez):* ler os 3 JSON, inserir em transação (ordem: accounts, cards, categories, recurrences, installment_groups, tasks, transactions, budgets, goals, goal_deposits), e só então marcar `vivaro:migrated=1` mantendo o localStorage como cópia por segurança.
