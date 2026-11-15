# Vivaro · Ecossistema: Cross-Module Bridge

Implementado na v1.7.0: `src/bridge.js` (registo e validação), `structureGoal()` / `generateMealPlan()` / `structureTask()` em `src/App.jsx`, chips e cadeia em `src/Goals.jsx`, cardápio em `src/Wellness.jsx`.

## 1. Motor de extração semântica
**Princípio:** a IA só *propõe*; o código *decide*. Cada ação do objetivo pode trazer um `link` opcional (no máximo um):
```json
{ "title": "Beber 2,5 L de água por dia", "dueOffsetDays": 7,
   "link": { "module_target": "saude_hidratacao", "action_type": "set_daily_goal", "payload_data": { "goalMl": 2500 } } }
```
O `responseSchema` do Gemini restringe `module_target` e `action_type` a enums e `payload_data` a campos conhecidos (`goalMl, kcalTarget, days, amount, name, category, dateOffsetDays, every, note`). Combinações permitidas (lista branca em `LINK_TYPES`):

| module_target / action_type | efeito | payload |
|---|---|---|
| saude_hidratacao / set_daily_goal | altera a meta diária de água | goalMl (500–6000) |
| saude_nutricao / meal_plan | pede à IA um cardápio de 7–30 dias e grava-o | kcalTarget (≥1200), days, note |
| financas_despesa / planned_expense | despesa **prevista** na 1.ª conta | amount, name, category, dateOffsetDays |
| financas_orcamento / set_budget | teto mensal numa categoria existente | category, amount |
| financas_meta / create_savings_goal | cofrinho | name, amount, dateOffsetDays |
| tarefas / recurring_task | tarefa repetida (diária/semanal/mensal) | name, every, note |

**Processamento (`sanitizeLink` → `applyLink`):** (1) chave `module.action` fora da lista ⇒ descartada; (2) o payload é limpo e limitado (ex.: 99 999 ml → 6 000; 300 kcal → 1 200); (3) só executa depois de o utilizador aceitar; (4) cada execução devolve a referência criada (`target_type`, `target_id`) que fica em `link.refs`; (5) falhas (ex.: "crie primeiro uma conta") ficam no chip e não impedem de guardar o objetivo. A IA nunca escreve diretamente em nenhum módulo. A mesma lógica corre num backend (PHP/Node) se um dia existir: o registo é só validação + escrita.

## 2. UI: o "Cross-Module Bridge"
- **Pré-visualização:** cada ação mostra um chip tracejado `☑ 🔗 💧 Saúde · Hidratação · Meta diária de água: 2500 ml / dia` — tocar alterna aceitar/ignorar, o X remove. Um painel resume "N ligações aceites a M módulos serão criadas ao guardar".
- **Ação em cadeia:** o botão passa a *Guardar e ligar (N)*; ao carregar cria o objetivo e executa as ligações aceites em sequência (mostra `A ligar módulos… 2/3`), criando dados em vários módulos de uma vez.
- **Vista final:** chip verde `✓ 💧 …` (toca para abrir o módulo); ligações ignoradas ou falhadas aparecem como `🔗 Ligar · …` para aplicar mais tarde; erros em vermelho.
- **Nutrição:** o cardápio aparece em Saúde → Refeições e jejum ("Cardápio de hoje", plano completo, apagar), com aviso de que não substitui um nutricionista.

## 3. Dados para ações cruzadas
No app as referências vivem em `action.link.refs` (cópia no backup). Em SQLite há duas formas, ambas testadas:
```sql
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
```
**Qual escolher:** a tabela polimórfica (A) é flexível e permite novos destinos sem migrar o esquema, mas não tem integridade referencial (daí o trigger). Os FKs opcionais (B) garantem integridade (`ON DELETE SET NULL`) mas exigem uma coluna por tipo de destino. Para o Vivaro (poucos destinos, uma só base) recomendo **B**; se crescerem muitos tipos (hábitos, consultas, treinos…), **A**.

## 4. Estruturar tarefa com IA
No editor de tarefas, o botão **Estruturar tarefa com IA** envia título/descrição/área e devolve subtarefas ordenadas, prioridade (Eisenhower), prazo sugerido e lembrete. Os dados **preenchem o formulário para revisão** (subtarefas acrescentam-se às existentes; descrição, prazo e lembrete só se estiverem vazios) — nada é gravado até carregar em Guardar.

## 5. Limites e cuidados
Cardápios e metas de água/calorias são sugestões, não aconselhamento médico (mínimo de 1 200 kcal imposto no código). Despesas previstas usam a primeira conta; categorias casam por nome. Traduções novas em pt/en/es.
