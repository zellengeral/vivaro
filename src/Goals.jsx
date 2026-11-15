import React, { useState } from "react";
import { Plus, X, Trash2, ChevronDown, ChevronRight, Target, Sparkles, CalendarPlus, Check, Pencil } from "lucide-react";
import { t, locale } from "./i18n.js";
import { Sheet, Field, Btn, Card, Bar, inputCls, inputSt } from "./Finance.jsx";
import { uidG, goalProgress, processProgress, actionDone, goalStats } from "./goalsLogic.js";

const C = new Proxy({}, { get: (_, k) => `var(--v-${String(k)})` });
const pct = (x) => `${Math.round(x * 100)}%`;
const fmt = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(locale(), { day: "2-digit", month: "short" }) : "");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function taskFromAction(goal, proc, a) {
  return {
    id: uidG(), title: a.title, description: `${t("Objetivo")}: ${goal.title} › ${proc.title}`, category: goal.area || "pessoal", quadrant: 2, status: "pendente",
    dueAt: a.dueDate ? new Date(`${a.dueDate}T09:00:00`).toISOString() : null,
    reminders: a.dueDate ? [{ id: uidG(), value: 1, unit: "days" }] : [], attachments: [], subtasks: [], assignee: "", watchers: [], comments: [], recurrence: null,
    alarmMode: false, clockAlarm: false, completedAt: null, createdAt: new Date().toISOString(),
  };
}

export default function GoalsView({ goals, setGoals, tasks, onCreateTask, onStructure, aiAvailable, _test }) {
  const [openId, setOpenId] = useState(_test?.openId || null);
  const [creating, setCreating] = useState(!!_test?.creating);
  const [draft, setDraft] = useState(_test?.draft || null); // {goal, summary, isNew}
  const [open, setOpen] = useState(_test?.open || {}); // processos expandidos
  const goal = goals.find((g) => g.id === openId);

  const patchGoal = (id, fn) => setGoals((gs) => gs.map((g) => (g.id === id ? fn(g) : g)));
  const toggleAction = (g, p, a) => patchGoal(g.id, (x) => ({ ...x, processes: x.processes.map((pp) => (pp.id !== p.id ? pp : { ...pp, actions: pp.actions.map((aa) => (aa.id === a.id ? { ...aa, done: !actionDone(aa, tasks) } : aa)) })) }));
  const makeTask = (g, p, a) => {
    const task = taskFromAction(g, p, a);
    onCreateTask(task);
    patchGoal(g.id, (x) => ({ ...x, processes: x.processes.map((pp) => (pp.id !== p.id ? pp : { ...pp, actions: pp.actions.map((aa) => (aa.id === a.id ? { ...aa, taskId: task.id } : aa)) })) }));
  };
  const makeAllTasks = (g, p) => {
    const made = {};
    p.actions.forEach((a) => { if (!actionDone(a, tasks) && !(a.taskId && tasks.some((x) => x.id === a.taskId))) { const task = taskFromAction(g, p, a); onCreateTask(task); made[a.id] = task.id; } });
    patchGoal(g.id, (x) => ({ ...x, processes: x.processes.map((pp) => (pp.id !== p.id ? pp : { ...pp, actions: pp.actions.map((aa) => (made[aa.id] ? { ...aa, taskId: made[aa.id] } : aa)) })) }));
  };

  /* ---------------- detalhe: árvore em acordeão ---------------- */
  if (goal) {
    const prog = goalProgress(goal, tasks), st = goalStats(goal, tasks, todayStr());
    return (
      <div className="max-w-xl space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={() => setOpenId(null)} className="p-1.5 rounded-lg text-sm font-semibold" style={{ color: C.primary }}>← {t("Objetivos")}</button>
          <div className="flex-1" />
          <button onClick={() => setDraft({ goal: JSON.parse(JSON.stringify(goal)), isNew: false })} className="p-2 rounded-lg" style={{ color: C.inkSoft }} aria-label={t("Editar")}><Pencil size={17} /></button>
          <button onClick={() => { if (window.confirm(t("Apagar este objetivo?"))) { setGoals((gs) => gs.filter((x) => x.id !== goal.id)); setOpenId(null); } }} className="p-2 rounded-lg" style={{ color: C.inkSoft }} aria-label={t("Apagar")}><Trash2 size={17} /></button>
        </div>
        <Card>
          <div className="flex items-start gap-3">
            <Target size={22} color={C.primary} className="mt-1" />
            <div className="flex-1 min-w-0"><h2 className="font-bold text-lg" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{goal.title}</h2>
              {goal.description && <p className="text-sm mt-0.5" style={{ color: C.inkSoft }}>{goal.description}</p>}</div>
            <div className="text-2xl font-bold" style={{ color: C.primary }}>{pct(prog)}</div>
          </div>
          <div className="mt-3"><Bar pct={prog} color={C.primary} /></div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-2" style={{ color: C.inkSoft }}>
            <span>{st.done}/{st.total} {t("ações")}</span>{goal.deadline && <span>{t("Prazo")}: {fmt(goal.deadline)}</span>}{st.overdue > 0 && <span style={{ color: C.danger }}>⚠ {st.overdue} {t("em atraso")}</span>}
          </div>
          {st.next && <div className="mt-3 p-2.5 rounded-xl text-xs" style={{ background: C.primarySoft, color: C.primaryDark }}>{t("Próxima ação")}: <b>{st.next.title}</b>{st.next.dueDate ? ` · ${fmt(st.next.dueDate)}` : ""}</div>}
        </Card>
        {goal.processes.length === 0 && <Card><div className="text-sm text-center" style={{ color: C.inkSoft }}>{t("Sem processos. Toque no lápis para editar a estrutura.")}</div></Card>}
        {goal.processes.map((p, i) => {
          const pp = processProgress(p, tasks), isOpen = open[p.id] ?? false;
          return (
            <Card key={p.id} className="!p-0 overflow-hidden">
              <button className="w-full flex items-center gap-3 p-4 text-left" onClick={() => setOpen({ ...open, [p.id]: !isOpen })}>
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ background: pp >= 1 ? C.primary : C.surfaceSunk, color: pp >= 1 ? "#fff" : C.inkSoft }}>{pp >= 1 ? <Check size={14} /> : i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm" style={{ color: C.ink }}>{p.title}</div>
                  <div className="mt-1.5"><Bar pct={pp} color={C.primary} /></div>
                  <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{pct(pp)}{p.dueDate ? ` · ${t("até")} ${fmt(p.dueDate)}` : ""}</div>
                </div>
                {isOpen ? <ChevronDown size={18} color={C.inkSoft} /> : <ChevronRight size={18} color={C.inkSoft} />}
              </button>
              {isOpen && (
                <div className="px-4 pb-4 space-y-1.5">
                  {p.description && <p className="text-xs mb-2" style={{ color: C.inkSoft }}>{p.description}</p>}
                  {p.actions.map((a) => {
                    const done = actionDone(a, tasks), linked = a.taskId && tasks.some((x) => x.id === a.taskId);
                    return (
                      <div key={a.id} className="flex items-center gap-2.5 py-1.5">
                        <button onClick={() => toggleAction(goal, p, a)} className="w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0" style={{ borderColor: done ? C.primary : C.border, background: done ? C.primary : "transparent" }} aria-label={t("Concluir")}>{done && <Check size={13} color="#fff" />}</button>
                        <div className="flex-1 min-w-0"><div className="text-sm" style={{ color: done ? C.inkSoft : C.ink, textDecoration: done ? "line-through" : "none" }}>{a.title}</div>
                          {a.dueDate && <div className="text-[11px]" style={{ color: !done && a.dueDate < todayStr() ? C.danger : C.inkSoft }}>{fmt(a.dueDate)}</div>}</div>
                        {linked ? <span className="text-[11px] px-2 py-1 rounded-lg" style={{ background: C.primarySoft, color: C.primary }}>{t("Tarefa")} ✓</span>
                          : !done && <button onClick={() => makeTask(goal, p, a)} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ background: C.surfaceSunk, color: C.primary }}><CalendarPlus size={12} />{t("Criar tarefa")}</button>}
                      </div>
                    );
                  })}
                  {p.actions.some((a) => !actionDone(a, tasks) && !(a.taskId && tasks.some((x) => x.id === a.taskId))) && (
                    <button onClick={() => makeAllTasks(goal, p)} className="text-xs font-semibold pt-1" style={{ color: C.primary }}>{t("Criar tarefas para todas as ações pendentes")}</button>
                  )}
                  {p.actions.length === 0 && <button onClick={() => patchGoal(goal.id, (x) => ({ ...x, processes: x.processes.map((q) => (q.id === p.id ? { ...q, done: !q.done } : q)) }))} className="text-xs font-semibold" style={{ color: C.primary }}>{p.done ? t("Reabrir marco") : t("Marcar marco como concluído")}</button>}
                </div>
              )}
            </Card>
          );
        })}
        {draft && <DraftSheet draft={draft} setDraft={setDraft} onStructure={onStructure} aiAvailable={aiAvailable} onSave={(g) => { setGoals((gs) => gs.map((x) => (x.id === g.id ? g : x))); setDraft(null); }} />}
      </div>
    );
  }

  /* ---------------- lista ---------------- */
  return (
    <div className="max-w-xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{t("Objetivos")}</h2>
        <Btn onClick={() => setCreating(true)}><Plus size={14} className="inline mr-1" />{t("Novo objetivo")}</Btn>
      </div>
      {goals.length === 0 && <Card><div className="text-sm text-center" style={{ color: C.inkSoft }}>{t("Defina o objetivo final e deixe a IA desenhar o caminho de trás para a frente: processos, ações e prazos.")}</div></Card>}
      {goals.map((g) => {
        const prog = goalProgress(g, tasks), st = goalStats(g, tasks, todayStr());
        return (
          <button key={g.id} onClick={() => setOpenId(g.id)} className="w-full text-left rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="flex items-center gap-3">
              <Target size={20} color={C.primary} />
              <div className="flex-1 min-w-0"><div className="font-semibold truncate" style={{ color: C.ink }}>{g.title}</div>
                <div className="text-xs" style={{ color: st.overdue ? C.danger : C.inkSoft }}>{g.processes.length} {t("processos")} · {st.done}/{st.total} {t("ações")}{g.deadline ? ` · ${fmt(g.deadline)}` : ""}{st.overdue ? ` · ⚠ ${st.overdue}` : ""}</div></div>
              <div className="font-bold" style={{ color: C.primary }}>{pct(prog)}</div>
            </div>
            <div className="mt-3"><Bar pct={prog} color={C.primary} /></div>
          </button>
        );
      })}
      {creating && <NewGoalSheet onClose={() => setCreating(false)} onStructure={onStructure} aiAvailable={aiAvailable}
        onDraft={(d) => { setCreating(false); setDraft(d); }} />}
      {draft && <DraftSheet draft={draft} setDraft={setDraft} onStructure={onStructure} aiAvailable={aiAvailable} onSave={(g) => { setGoals((gs) => [g, ...gs]); setDraft(null); setOpenId(g.id); }} />}
    </div>
  );
}

/* ---------------- 1.º passo: descrever o objetivo ---------------- */
function NewGoalSheet({ onClose, onDraft, onStructure, aiAvailable }) {
  const [f, setF] = useState({ title: "", context: "", area: "pessoal", deadline: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const base = () => ({ id: uidG(), title: f.title.trim(), description: f.context.trim(), area: f.area, deadline: f.deadline, createdAt: new Date().toISOString(), processes: [] });
  const ai = async () => {
    setBusy(true); setErr("");
    try { const r = await onStructure({ title: f.title.trim(), context: f.context.trim(), deadline: f.deadline, area: f.area }); onDraft({ goal: { ...base(), processes: r.processes }, summary: r.summary, isNew: true, input: f }); }
    catch (e) { setErr(e.message || t("Não foi possível estruturar com a IA.")); setBusy(false); }
  };
  return (
    <Sheet title={t("Novo objetivo")} onClose={busy ? () => {} : onClose}
      footer={<><Btn kind="ghost" disabled={busy || !f.title.trim()} onClick={() => onDraft({ goal: base(), isNew: true, input: f })}>{t("Criar manualmente")}</Btn>
        <Btn disabled={busy || !f.title.trim() || !aiAvailable} onClick={ai}><Sparkles size={14} className="inline mr-1" />{busy ? t("A estruturar…") : t("Estruturar com IA")}</Btn></>}>
      <Field label={t("Objetivo final")}><input className={inputCls} style={inputSt} placeholder={t("ex.: Correr a meia maratona de Lisboa")} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <Field label={t("Contexto (opcional)")}><textarea rows={3} className={inputCls} style={inputSt} placeholder={t("Ponto de partida, restrições, tempo disponível…")} value={f.context} onChange={(e) => setF({ ...f, context: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Área")}><select className={inputCls} style={inputSt} value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })}><option value="pessoal">{t("Pessoal")}</option><option value="profissional">{t("Profissional")}</option></select></Field>
        <Field label={t("Prazo")}><input type="date" className={inputCls} style={inputSt} value={f.deadline} onChange={(e) => setF({ ...f, deadline: e.target.value })} /></Field>
      </div>
      {!aiAvailable && <div className="text-xs" style={{ color: C.inkSoft }}>{t("A IA não está configurada nesta instalação; pode criar a estrutura manualmente.")}</div>}
      {err && <div className="text-sm p-2.5 rounded-xl" style={{ background: C.dangerSoft, color: C.danger }}>{err}</div>}
    </Sheet>
  );
}

/* ---------------- 2.º passo: rever / editar antes de gravar ---------------- */
function DraftSheet({ draft, setDraft, onSave, onStructure, aiAvailable }) {
  const g = draft.goal;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const setG = (fn) => setDraft({ ...draft, goal: fn(g) });
  const setP = (pid, fn) => setG((x) => ({ ...x, processes: x.processes.map((p) => (p.id === pid ? fn(p) : p)) }));
  const setA = (pid, aid, fn) => setP(pid, (p) => ({ ...p, actions: p.actions.map((a) => (a.id === aid ? fn(a) : a)) }));
  const regenerate = async () => {
    setBusy(true); setErr("");
    try { const r = await onStructure({ title: g.title, context: g.description, deadline: g.deadline, area: g.area }); setDraft({ ...draft, goal: { ...g, processes: r.processes }, summary: r.summary }); }
    catch (e) { setErr(e.message || ""); }
    setBusy(false);
  };
  const small = "px-2 py-1.5 rounded-lg border text-sm outline-none";
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" style={{ background: "rgba(28,31,36,0.5)" }}>
      <div className="w-full sm:max-w-lg max-h-[94vh] flex flex-col rounded-t-2xl sm:rounded-2xl" style={{ background: C.surface }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <div className="min-w-0"><div className="text-[11px] font-bold uppercase" style={{ color: C.primary }}>{draft.isNew ? t("Pré-visualização · ainda não guardado") : t("Editar estrutura")}</div>
            <input className="w-full font-bold text-lg bg-transparent outline-none" style={{ color: C.ink }} value={g.title} onChange={(e) => setG((x) => ({ ...x, title: e.target.value }))} /></div>
          <button onClick={() => setDraft(null)} className="p-1.5" style={{ color: C.inkSoft }}><X size={20} /></button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4 flex-1" style={busy ? { opacity: 0.5 } : null}>
          {draft.summary && <div className="text-xs p-3 rounded-xl" style={{ background: C.primarySoft, color: C.primaryDark }}>✨ {draft.summary}</div>}
          {err && <div className="text-sm p-2.5 rounded-xl" style={{ background: C.dangerSoft, color: C.danger }}>{err}</div>}
          {g.processes.map((p, i) => (
            <div key={p.id} className="rounded-xl p-3 space-y-2" style={{ border: `1px solid ${C.border}`, background: C.surfaceSunk }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold w-5 text-center" style={{ color: C.primary }}>{i + 1}</span>
                <input className={`${small} flex-1 min-w-0 font-semibold`} style={inputSt} value={p.title} onChange={(e) => setP(p.id, (x) => ({ ...x, title: e.target.value }))} />
                <input type="date" className={`${small} w-[8.5rem]`} style={inputSt} value={p.dueDate || ""} onChange={(e) => setP(p.id, (x) => ({ ...x, dueDate: e.target.value }))} />
                <button onClick={() => setG((x) => ({ ...x, processes: x.processes.filter((q) => q.id !== p.id) }))} style={{ color: C.inkSoft }}><Trash2 size={15} /></button>
              </div>
              <div className="pl-7 space-y-1.5">
                {p.actions.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <input className={`${small} flex-1 min-w-0`} style={inputSt} value={a.title} onChange={(e) => setA(p.id, a.id, (x) => ({ ...x, title: e.target.value }))} />
                    <input type="date" className={`${small} w-[8.5rem]`} style={inputSt} value={a.dueDate || ""} onChange={(e) => setA(p.id, a.id, (x) => ({ ...x, dueDate: e.target.value }))} />
                    <button onClick={() => setP(p.id, (x) => ({ ...x, actions: x.actions.filter((q) => q.id !== a.id) }))} style={{ color: C.inkSoft }}><X size={15} /></button>
                  </div>
                ))}
                <button className="text-xs font-semibold" style={{ color: C.primary }} onClick={() => setP(p.id, (x) => ({ ...x, actions: [...x.actions, { id: uidG(), title: "", dueDate: x.dueDate || "", done: false, taskId: null }] }))}>+ {t("Ação")}</button>
              </div>
            </div>
          ))}
          <button className="text-sm font-semibold" style={{ color: C.primary }} onClick={() => setG((x) => ({ ...x, processes: [...x.processes, { id: uidG(), title: "", description: "", dueDate: "", weight: 1, done: false, actions: [] }] }))}>+ {t("Processo")}</button>
        </div>
        <div className="px-5 py-4 flex gap-2" style={{ borderTop: `1px solid ${C.border}` }}>
          {aiAvailable && <Btn kind="ghost" disabled={busy} onClick={regenerate}><Sparkles size={14} className="inline mr-1" />{busy ? t("A estruturar…") : t("Regenerar")}</Btn>}
          <div className="flex-1" />
          <Btn disabled={busy || !g.title.trim()} onClick={() => onSave({ ...g, title: g.title.trim(), processes: g.processes.filter((p) => p.title.trim()).map((p) => ({ ...p, title: p.title.trim(), actions: p.actions.filter((a) => a.title.trim()).map((a) => ({ ...a, title: a.title.trim() })) })) })}>{t("Guardar")}</Btn>
        </div>
      </div>
    </div>
  );
}
