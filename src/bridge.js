// Cross-Module Bridge: contrato entre a IA (Objetivos) e os restantes módulos.
// A IA só PROPÕE ligações { module_target, action_type, payload_data }; este registo (lista branca) valida,
// limita valores e executa. Nada que não esteja aqui é aplicado.
import * as F from "./financeLogic.js";

export const MODULE_META = {
  saude_hidratacao: { label: "Saúde · Hidratação", emoji: "💧", nav: "saude" },
  saude_nutricao: { label: "Saúde · Nutrição", emoji: "🍎", nav: "saude" },
  financas: { label: "Finanças", emoji: "💶", nav: "financas" },
  tarefas: { label: "Tarefas", emoji: "✅", nav: "tarefas" },
};

const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
const num = (v) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) ? n : null; };
const str = (v, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isoPlus = (days) => { const d = new Date(); d.setDate(d.getDate() + clamp(Math.round(num(days) || 0), 0, 3650)); return F.isoOf(d); };
const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ctx: { finance, setFinance, setHealth, updateHydration, createTask, generateMealPlan }
export const LINK_TYPES = {
  "saude_hidratacao.set_daily_goal": {
    module: "saude_hidratacao", title: "Meta diária de água",
    sanitize(p) { const ml = num(p.goalMl); return ml == null ? null : { goalMl: clamp(Math.round(ml / 50) * 50, 500, 6000) }; },
    describe: (p) => `${p.goalMl} ml / dia`,
    async apply(ctx, p) { ctx.updateHydration({ goalMl: p.goalMl }); return { target_type: "hydration_config", target_id: "hydration" }; },
  },
  "saude_nutricao.meal_plan": {
    module: "saude_nutricao", title: "Plano de cardápio",
    sanitize(p) { const k = num(p.kcalTarget), d = num(p.days); return k == null ? null : { kcalTarget: clamp(Math.round(k / 10) * 10, 1200, 4000), days: clamp(Math.round(d || 30), 7, 30), note: str(p.note, 200) }; },
    describe: (p) => `${p.days} dias · ~${p.kcalTarget} kcal/dia`,
    async apply(ctx, p) { const plan = await ctx.generateMealPlan(p); ctx.setHealth((h) => ({ ...h, mealPlan: plan })); return { target_type: "meal_plan", target_id: plan.id }; },
  },
  "financas_despesa.planned_expense": {
    module: "financas", title: "Despesa prevista",
    sanitize(p) { const a = num(p.amount); return a == null || a <= 0 ? null : { amount: Math.round(a * 100) / 100, name: str(p.name) || "—", category: str(p.category, 40), dateOffsetDays: clamp(Math.round(num(p.dateOffsetDays) || 0), 0, 3650) }; },
    describe: (p, cur) => `${F.fmtMoney(Math.round(p.amount * 100), cur || "EUR")} · ${p.name}`,
    async apply(ctx, p) {
      const acc = ctx.finance.accounts[0]; if (!acc) throw new Error("Crie primeiro uma conta no módulo Finanças.");
      const cat = matchCategory(ctx.finance, p.category, "expense");
      let id = null;
      ctx.setFinance((f) => { const n = F.addTransaction(f, { type: "expense", amountCents: Math.round(p.amount * 100), date: isoPlus(p.dateOffsetDays), accountId: acc.id, description: p.name, categoryId: cat?.id || null, status: "planned" }); id = n.transactions[n.transactions.length - 1].id; return n; });
      return { target_type: "transaction", target_id: id };
    },
  },
  "financas_orcamento.set_budget": {
    module: "financas", title: "Teto de gastos mensal",
    sanitize(p) { const a = num(p.amount); return a == null || a <= 0 || !str(p.category) ? null : { amount: Math.round(a * 100) / 100, category: str(p.category, 40) }; },
    describe: (p, cur) => `${p.category}: ${F.fmtMoney(Math.round(p.amount * 100), cur || "EUR")} / mês`,
    async apply(ctx, p) {
      const cat = matchCategory(ctx.finance, p.category, "expense"); if (!cat) throw new Error(`Categoria "${p.category}" não encontrada em Finanças.`);
      const id = F.uidF();
      ctx.setFinance((f) => ({ ...f, budgets: [...f.budgets.filter((b) => b.categoryId !== cat.id), { id, categoryId: cat.id, limitCents: Math.round(p.amount * 100) }] }));
      return { target_type: "budget", target_id: id };
    },
  },
  "financas_meta.create_savings_goal": {
    module: "financas", title: "Cofrinho",
    sanitize(p) { const a = num(p.amount); return a == null || a <= 0 ? null : { amount: Math.round(a * 100) / 100, name: str(p.name) || "Meta", dateOffsetDays: clamp(Math.round(num(p.dateOffsetDays) || 0), 0, 3650) }; },
    describe: (p, cur) => `${p.name} · ${F.fmtMoney(Math.round(p.amount * 100), cur || "EUR")}`,
    async apply(ctx, p) {
      const id = F.uidF();
      ctx.setFinance((f) => ({ ...f, goals: [...f.goals, { id, name: p.name, targetCents: Math.round(p.amount * 100), deadline: p.dateOffsetDays ? isoPlus(p.dateOffsetDays) : null }] }));
      return { target_type: "savings_goal", target_id: id };
    },
  },
  "tarefas.recurring_task": {
    module: "tarefas", title: "Tarefa repetida",
    sanitize(p) { const e = ["daily", "weekly", "monthly"].includes(p.every) ? p.every : null; return !e || !str(p.name) ? null : { name: str(p.name, 100), every: e, note: str(p.note, 200) }; },
    describe: (p) => `${p.name} · ${{ daily: "diária", weekly: "semanal", monthly: "mensal" }[p.every]}`,
    async apply(ctx, p) {
      const due = new Date(); due.setDate(due.getDate() + 1); due.setHours(9, 0, 0, 0);
      const rec = p.every === "daily" ? { type: "daily" } : p.every === "weekly" ? { type: "weekly", weekDays: [due.getDay()] } : { type: "monthly_day" };
      const id = F.uidF();
      ctx.createTask({ id, title: p.name, description: p.note || "", category: "pessoal", quadrant: 2, status: "pendente", dueAt: due.toISOString(), reminders: [], attachments: [], subtasks: [], assignee: "", watchers: [], comments: [], recurrence: rec, alarmMode: false, clockAlarm: false, completedAt: null, createdAt: new Date().toISOString() });
      return { target_type: "task", target_id: id };
    },
  },
};

export function matchCategory(fin, name, kind) {
  const n = norm(name); if (!n) return null;
  const list = fin.categories.filter((c) => c.kind === kind);
  return list.find((c) => norm(c.name) === n) || list.find((c) => norm(c.name).includes(n) || n.includes(norm(c.name))) || null;
}

// Valida e limpa uma ligação vinda da IA. Devolve null se não estiver na lista branca.
export function sanitizeLink(raw) {
  if (!raw || typeof raw !== "object") return null;
  const key = `${raw.module_target}.${raw.action_type}`;
  const def = LINK_TYPES[key]; if (!def) return null;
  const payload = def.sanitize(raw.payload_data && typeof raw.payload_data === "object" ? raw.payload_data : {});
  if (!payload) return null;
  return { key, module_target: raw.module_target, action_type: raw.action_type, payload_data: payload, status: "suggested", accepted: true, refs: null, error: "" };
}

export async function applyLink(ctx, link) {
  const def = LINK_TYPES[link.key]; if (!def) throw new Error("Ligação desconhecida.");
  const again = def.sanitize(link.payload_data); if (!again) throw new Error("Dados inválidos.");
  return def.apply(ctx, again);
}
