// Objetivos (Goal-Backward Planning): Objetivo → Processos/Marcos → Ações. Funções puras.
export const GOALS_KEY = "vivaro:goals:v1";
const uidG = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export { uidG };

export function normalizeGoals(g) {
  if (!Array.isArray(g)) return [];
  return g.filter((x) => x && x.id).map((x) => ({
    area: "pessoal", description: "", deadline: "", createdAt: new Date().toISOString(), archived: false, ...x,
    processes: (Array.isArray(x.processes) ? x.processes : []).map((p) => ({ weight: 1, description: "", dueDate: "", done: false, ...p, actions: (Array.isArray(p.actions) ? p.actions : []).map((a) => ({ done: false, dueDate: "", taskId: null, ...a })) })),
  }));
}

// Uma ação conta como feita se marcada, ou se a tarefa ligada está concluída no módulo Tarefas.
export function actionDone(a, tasks = []) {
  if (a.done) return true;
  if (!a.taskId) return false;
  const tk = tasks.find((x) => x.id === a.taskId);
  return !!tk && tk.status === "concluido";
}

// Progresso do processo: ações feitas / total. Sem ações, o próprio marco vale 0 ou 100.
export function processProgress(p, tasks = []) {
  const n = p.actions.length;
  if (!n) return p.done ? 1 : 0;
  return p.actions.filter((a) => actionDone(a, tasks)).length / n;
}

// Progresso do objetivo: média dos processos ponderada por `weight` (omissão 1).
export function goalProgress(g, tasks = []) {
  const ps = g.processes;
  if (!ps.length) return 0;
  const w = ps.reduce((s, p) => s + (p.weight > 0 ? p.weight : 1), 0);
  return ps.reduce((s, p) => s + processProgress(p, tasks) * (p.weight > 0 ? p.weight : 1), 0) / w;
}

export function goalStats(g, tasks = [], today = new Date().toISOString().slice(0, 10)) {
  const all = g.processes.flatMap((p) => p.actions);
  const pending = all.filter((a) => !actionDone(a, tasks));
  const next = [...pending].sort((a, b) => ((a.dueDate || "9999") < (b.dueDate || "9999") ? -1 : 1))[0] || null;
  return { total: all.length, done: all.length - pending.length, overdue: pending.filter((a) => a.dueDate && a.dueDate < today).length, next };
}

export function mergeGoals(have, incoming) {
  const ids = new Set(have.map((g) => g.id));
  return [...have, ...normalizeGoals(incoming).filter((g) => !ids.has(g.id))];
}
