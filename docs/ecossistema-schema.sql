PRAGMA foreign_keys = ON;
-- (assume-se criadas as tabelas dos outros módulos: tasks, goals, goal_actions, transactions, budgets, goals(finance→savings_goals), health_*)

-- A) Opção polimórfica: uma tabela de relações para qualquer origem/destino
CREATE TABLE entity_links (
  id           TEXT PRIMARY KEY,
  source_type  TEXT NOT NULL CHECK (source_type IN ('goal','goal_action','task')),
  source_id    TEXT NOT NULL,
  target_module TEXT NOT NULL CHECK (target_module IN ('saude_hidratacao','saude_nutricao','financas','tarefas')),
  target_type  TEXT NOT NULL CHECK (target_type IN ('hydration_config','meal_plan','transaction','budget','savings_goal','task')),
  target_id    TEXT,                               -- NULL enquanto 'suggested'
  relation     TEXT NOT NULL CHECK (relation IN ('created_from','tracks','funds','schedules')),
  action_type  TEXT NOT NULL,                      -- set_daily_goal, meal_plan, planned_expense, …
  payload_json TEXT NOT NULL DEFAULT '{}',         -- parâmetros validados pela lista branca
  status       TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','applied','failed','dismissed')),
  error        TEXT, created_at TEXT NOT NULL, applied_at TEXT,
  CHECK (status <> 'applied' OR target_id IS NOT NULL)
);
CREATE INDEX idx_el_source ON entity_links(source_type, source_id);
CREATE INDEX idx_el_target ON entity_links(target_type, target_id);
CREATE UNIQUE INDEX idx_el_once ON entity_links(source_type, source_id, target_type, target_id, relation) WHERE target_id IS NOT NULL;

-- Sem FK possível ⇒ limpeza por trigger quando o destino desaparece (exemplo: transação apagada)
CREATE TRIGGER trg_el_tx_deleted AFTER DELETE ON transactions
BEGIN UPDATE entity_links SET status='dismissed', target_id=NULL, error='destino apagado'
      WHERE target_type='transaction' AND target_id=OLD.id; END;

-- B) Opção com FKs reais (recomendada quando os destinos são poucos e estão no mesmo SQLite)
CREATE TABLE goal_action_links (
  id TEXT PRIMARY KEY,
  goal_action_id TEXT NOT NULL REFERENCES goal_actions(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested','applied','failed','dismissed')),
  target_task_id        TEXT REFERENCES tasks(id)        ON DELETE SET NULL,
  target_transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  target_budget_id      TEXT REFERENCES budgets(id)      ON DELETE SET NULL,
  CHECK ((target_task_id IS NOT NULL) + (target_transaction_id IS NOT NULL) + (target_budget_id IS NOT NULL) <= 1)
);

-- Consulta transversal: custo previsto ligado a cada objetivo (liga Objetivos ↔ Finanças)
CREATE VIEW v_goal_planned_cost AS
  SELECT ga.process_id, el.source_id AS goal_action_id, SUM(t.amount_cents) AS planned_cents
    FROM entity_links el
    JOIN goal_actions ga ON ga.id = el.source_id AND el.source_type = 'goal_action'
    JOIN transactions t  ON t.id = el.target_id  AND el.target_type = 'transaction'
   WHERE el.status = 'applied' GROUP BY el.source_id;
