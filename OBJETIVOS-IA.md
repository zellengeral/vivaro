# Vivaro · Objetivos (Goal-Backward Planning com IA)

Implementado no app (módulo **Objetivos**, menu inferior): `src/Goals.jsx` (UI), `src/goalsLogic.js` (progresso), `structureGoal()` em `src/App.jsx` (Gemini). Os dados vivem em `localStorage` (`vivaro:goals:v1`) e entram no backup (versão 5, campo `goals`). O SQL abaixo é o equivalente relacional, testado em SQLite.

## 1. Modelo de dados
Três níveis em tabelas distintas (pai → filho com `ON DELETE CASCADE`): `goals` → `goal_processes` → `goal_actions`. A ligação às tarefas é `goal_actions.task_id → tasks.id` (`ON DELETE SET NULL`: apagar a tarefa não apaga a ação).

```sql
PRAGMA foreign_keys = ON;
CREATE TABLE goals (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
  area TEXT NOT NULL DEFAULT 'pessoal' CHECK (area IN ('pessoal','profissional')),
  deadline TEXT, archived INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE goal_processes (          -- marcos / processos
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, title TEXT NOT NULL, description TEXT, due_date TEXT,
  weight REAL NOT NULL DEFAULT 1 CHECK (weight > 0),
  done INTEGER NOT NULL DEFAULT 0              -- só usado se o processo não tiver ações
);
CREATE TABLE goal_actions (            -- sub-processos / ações
  id TEXT PRIMARY KEY, process_id TEXT NOT NULL REFERENCES goal_processes(id) ON DELETE CASCADE,
  position INTEGER NOT NULL, title TEXT NOT NULL, due_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL      -- ligação ao módulo Tarefas
);
CREATE INDEX idx_gp_goal ON goal_processes(goal_id, position);
CREATE INDEX idx_ga_proc ON goal_actions(process_id, position);

-- "feita" = marcada OU tarefa ligada concluída
CREATE VIEW v_action_done AS
  SELECT a.id, a.process_id,
         CASE WHEN a.done = 1 OR t.status = 'concluido' THEN 1 ELSE 0 END AS is_done
    FROM goal_actions a LEFT JOIN tasks t ON t.id = a.task_id;

-- progresso do processo (0..1)
CREATE VIEW v_process_progress AS
  SELECT p.id AS process_id, p.goal_id, p.weight,
         CASE WHEN COUNT(v.id) = 0 THEN p.done ELSE 1.0 * SUM(v.is_done) / COUNT(v.id) END AS progress
    FROM goal_processes p LEFT JOIN v_action_done v ON v.process_id = p.id GROUP BY p.id;

-- progresso do objetivo (0..1): média ponderada dos processos
CREATE VIEW v_goal_progress AS
  SELECT g.id AS goal_id, COALESCE(SUM(pp.progress * pp.weight) / SUM(pp.weight), 0) AS progress
    FROM goals g LEFT JOIN v_process_progress pp ON pp.goal_id = g.id GROUP BY g.id;
```

**Cálculo do progresso (sempre derivado, nunca guardado):**
- Ação feita = `done = 1` **ou** tarefa ligada com `status = 'concluido'` (concluir no módulo Tarefas atualiza o objetivo sozinho).
- Progresso do processo = ações feitas / total de ações (sem ações: o próprio marco vale 0 ou 1).
- Progresso do objetivo = média dos processos ponderada por `weight` (omissão 1; um processo mais pesado conta mais). Exemplo testado: processo 1 a 50 % (peso 1) e processo 2 a 100 % (peso 3) → 87,5 %.
Em JS: `goalProgress(goal, tasks)` em `goalsLogic.js` (testado com asserts).

## 2. Integração com o Gemini (saída estruturada)
Chamada `generateContent` com `systemInstruction` + `responseMimeType: "application/json"` + `responseSchema` (a resposta fica garantida no formato). O modelo devolve **dias a contar de hoje** (inteiros), não datas ISO — o código converte e limita ao prazo, o que evita datas inventadas ou passadas.

```js
const GOAL_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    processes: { type: "ARRAY", items: { type: "OBJECT", properties: {
      title: { type: "STRING" }, description: { type: "STRING" }, endOffsetDays: { type: "INTEGER" },
      actions: { type: "ARRAY", items: { type: "OBJECT", properties: { title: { type: "STRING" }, dueOffsetDays: { type: "INTEGER" } }, required: ["title", "dueOffsetDays"] } }
    }, required: ["title", "description", "endOffsetDays", "actions"] } }
  },
  required: ["processes"]
};
// corpo do pedido
{ systemInstruction: { parts: [{ text: SYSTEM }] },
  contents: [{ role: "user", parts: [{ text: "OBJETIVO FINAL: …\nPRAZO TOTAL: 120 dias\nCONTEXTO: …" }] }],
  generationConfig: { responseMimeType: "application/json", responseSchema: GOAL_SCHEMA, temperature: 0.4, maxOutputTokens: 4000,
                      thinkingConfig: { thinkingLevel: "low" } /* ou thinkingBudget:1024 nos 2.5 */ } }
```
**System prompt (resumo):** *És um planeador especialista em Engenharia Reversa. Parte do estado final e trabalha de trás para a frente: 3 a 7 processos/marcos por ordem cronológica, cada um condição necessária do seguinte; 2 a 6 ações por processo, pequenas, concretas e mensuráveis (verbo + resultado verificável). Não inventes factos sobre o utilizador; offsets crescentes e dentro do prazo; a última ação conclui o objetivo; escreve no idioma do utilizador; responde só com JSON conforme o esquema.* (texto completo em `structureGoal`).
Robustez: reutiliza a lista de modelos com fallback e o retry de 429/503; se um modelo rejeitar `responseSchema` (HTTP 400) repete sem schema (o prompt mantém o formato) e o parser tolera cercas ```json. Validação final: precisa de ≥ 1 processo, limita a 10 processos × 10 ações e gera ids novos.

## 3. Fluxo de UI
1. **Novo objetivo** → título, contexto, área, prazo → *Estruturar com IA* (ou *Criar manualmente*).
2. **Pré-visualização editável (nada é gravado ainda):** processos numerados com ações; editar texto e datas, apagar, adicionar processo/ação, *Regenerar*; só *Guardar* grava.
3. **Vista final em acordeão:** cabeçalho com % total, ações feitas, atraso e *Próxima ação*; cada processo mostra barra de progresso e expande para as ações com checkbox.
4. **Ligação a Tarefas:** em cada ação, *Criar tarefa* (título da ação, descrição "Objetivo › Processo", mesma área, prioridade "Planear" (Q2), prazo às 09:00 e lembrete 1 dia antes — herda alarmes nativos) ou *Criar tarefas para todas as ações pendentes*. A ação guarda `taskId`; concluir a tarefa conclui a ação e sobe o progresso.

## 4. Limites
Estrutura gerada por IA é uma sugestão a rever; datas e esforço são estimativas. As traduções novas estão em pt/en/es (outros idiomas mostram inglês).
