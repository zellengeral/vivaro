// Sincronização idempotente das tarefas ligadas a um registo de outro módulo (medicamento, consulta…).
// Guardar várias vezes o mesmo registo NUNCA cria tarefas repetidas: atualiza a existente, cria só o que falta e remove sobras.
export function syncTasks(prev, source, desired, legacyIds, newId) {
  const open = (x) => x.status !== "concluido" && x.status !== "cancelado";
  const isMine = (x) => open(x) && ((x.source && x.source.type === source.type && x.source.id === source.id) || legacyIds.includes(x.id) || (!x.source && desired.some((d) => d.title === x.title)));
  const mine = prev.filter(isMine);
  const sameClock = (a, b) => { if (!a || !b) return false; const x = new Date(a), y = new Date(b); return x.getHours() === y.getHours() && x.getMinutes() === y.getMinutes(); };
  const used = new Set(), updates = new Map(), creates = [];
  desired.forEach((d) => {
    const cand = mine.find((x) => !used.has(x.id) && ((x.source && x.source.key === d.key) || (!x.source && x.title === d.title)));
    if (cand) {
      used.add(cand.id);
      updates.set(cand.id, { ...cand, title: d.title, description: d.description, alarmMode: d.alarmMode, recurrence: d.recurrence, reminders: d.reminders,
        dueAt: d.keepDue && cand.dueAt && sameClock(cand.dueAt, d.dueAt) ? cand.dueAt : d.dueAt, source: { ...source, key: d.key } });
    } else {
      const { key, keepDue, ...task } = d; // eslint-disable-line no-unused-vars
      creates.push({ ...task, id: newId(), source: { ...source, key } });
    }
  });
  const drop = new Set(mine.filter((x) => !used.has(x.id)).map((x) => x.id)); // sobras: duplicados ou horários removidos
  return [...creates, ...prev.filter((x) => !drop.has(x.id)).map((x) => updates.get(x.id) || x)];
}
