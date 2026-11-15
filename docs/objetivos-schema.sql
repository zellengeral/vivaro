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
