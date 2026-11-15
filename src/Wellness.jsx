import React, { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, ChevronLeft, Pill, Stethoscope, Activity, Moon, Smile, Wind, Dumbbell, Utensils, Paperclip, Check, X } from "lucide-react";
import { t, locale } from "./i18n.js";
import { Sheet, Field, Btn, Card, Bar, inputCls, inputSt } from "./Finance.jsx";
import * as F from "./financeLogic.js";

const C = new Proxy({}, { get: (_, k) => `var(--v-${String(k)})` });
export const HX_KEYS = ["meds", "medLog", "appts", "vitals", "sleep", "mood", "breath", "workouts", "meals", "fastLog"];
export const uidW = F.uidF;
const arr = (h, k) => (Array.isArray(h[k]) ? h[k] : []);
const today = () => F.todayISO();
const nowISO = () => new Date().toISOString();
const dOf = (iso) => iso.slice(0, 10);
const fmtDay = (iso) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString(locale(), { day: "2-digit", month: "short" });
const lastDays = (n) => Array.from({ length: n }, (_, i) => F.addDaysISO(today(), i - (n - 1)));

export function normalizeHx(h) {
  const out = { ...h };
  HX_KEYS.forEach((k) => { if (!Array.isArray(out[k])) out[k] = []; });
  if (!out.fasting) out.fasting = null; // {startAt,targetH}
  if (!out.mealPlan) out.mealPlan = null; // {id,kcalTarget,days:[{date,meals:[{slot,name,kcal}]}]}
  return out;
}
export function mergeHx(h, inc) {
  const out = { ...h };
  HX_KEYS.forEach((k) => {
    const have = new Set(arr(h, k).map((x) => x.id));
    out[k] = [...arr(h, k), ...arr(inc || {}, k).filter((x) => x && x.id && !have.has(x.id))];
  });
  if (!out.fasting && inc && inc.fasting) out.fasting = inc.fasting;
  if (!out.mealPlan && inc && inc.mealPlan) out.mealPlan = inc.mealPlan;
  return out;
}

export const SUBMODULES = [
  { id: "meds", icon: Pill, label: "Medicamentos", sub: "Alertas, histórico de tomas e stock" },
  { id: "appts", icon: Stethoscope, label: "Consultas e exames", sub: "Agenda, validade de exames e anexos" },
  { id: "vitals", icon: Activity, label: "Biometria", sub: "Peso, IMC, tensão, pulso e glicemia" },
  { id: "sleep", icon: Moon, label: "Sono", sub: "Horas, qualidade e ligação às tarefas" },
  { id: "mood", icon: Smile, label: "Humor", sub: "Como se sente e porquê" },
  { id: "breath", icon: Wind, label: "Pausas e respiração", sub: "Exercícios guiados e pausa ativa" },
  { id: "workouts", icon: Dumbbell, label: "Atividade física", sub: "Treinos, duração e consistência" },
  { id: "meals", icon: Utensils, label: "Refeições e jejum", sub: "Cronómetro de jejum e alimentação do dia" },
];

/* ------------------------------ utilitários de UI ------------------------------ */
const Page = ({ title, onBack, action, children }) => (
  <div className="max-w-xl space-y-4">
    <div className="flex items-center gap-2">
      <button onClick={onBack} className="p-1.5 rounded-lg" style={{ color: C.inkSoft }}><ChevronLeft size={20} /></button>
      <h2 className="flex-1 font-bold text-lg" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{title}</h2>
      {action}
    </div>
    {children}
  </div>
);
const AddBtn = ({ onClick, label }) => <Btn onClick={onClick}><Plus size={14} className="inline mr-1" />{label}</Btn>;
const Empty = ({ text }) => <Card><div className="text-sm text-center" style={{ color: C.inkSoft }}>{text}</div></Card>;
const Del = ({ onClick }) => <button onClick={onClick} className="p-1" style={{ color: C.inkSoft }} aria-label={t("Apagar")}><Trash2 size={15} /></button>;

function Line({ points, color = "var(--v-primary)", unit = "" }) {
  const vals = points.filter((p) => p.v != null);
  if (vals.length < 2) return <div className="text-xs text-center py-6" style={{ color: C.inkSoft }}>{t("Registe pelo menos 2 valores para ver o gráfico.")}</div>;
  const W = 300, H = 110, pad = 8;
  const min = Math.min(...vals.map((p) => p.v)), max = Math.max(...vals.map((p) => p.v)), span = max - min || 1;
  const xy = vals.map((p, i) => [pad + (i * (W - 2 * pad)) / (vals.length - 1), H - pad - ((p.v - min) / span) * (H - 2 * pad)]);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
        <polyline fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" points={xy.map((p) => p.join(",")).join(" ")} />
        {xy.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={color} />)}
      </svg>
      <div className="flex justify-between text-[11px]" style={{ color: C.inkSoft }}><span>{fmtDay(vals[0].d)} · {vals[0].v}{unit}</span><span>{vals[vals.length - 1].v}{unit} · {fmtDay(vals[vals.length - 1].d)}</span></div>
    </div>
  );
}

function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      if (!file.type.startsWith("image/")) return resolve({ kind: "file", name: file.name, dataUrl: reader.result });
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1280 / Math.max(img.width, img.height));
        const cv = document.createElement("canvas"); cv.width = img.width * s; cv.height = img.height * s;
        cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
        resolve({ kind: "image", name: file.name, dataUrl: cv.toDataURL("image/jpeg", 0.7) });
      };
      img.onerror = reject; img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Próxima ocorrência de HH:MM (hoje se ainda não passou, senão amanhã)
function nextAt(time) {
  const [h, m] = time.split(":").map(Number); const d = new Date(); d.setHours(h || 0, m || 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d.toISOString();
}
const mkTask = (over) => ({ id: uidW(), title: "", description: "", category: "pessoal", quadrant: 1, status: "pendente", dueAt: null, reminders: [], attachments: [], subtasks: [], assignee: "", watchers: [], comments: [], recurrence: null, alarmMode: false, clockAlarm: false, completedAt: null, createdAt: nowISO(), ...over });

/* ------------------------------ 1. Medicamentos ------------------------------ */
function Meds({ hx, upd, onBack, onSyncTasks, addExpense }) {
  const meds = arr(hx, "meds"), log = arr(hx, "medLog");
  const [edit, setEdit] = useState(null); // med | {} novo
  const [restock, setRestock] = useState(null);
  const day = today();
  const doneSlot = (m, time) => log.find((l) => l.medId === m.id && l.slot === `${day}|${time}`);
  const mark = (m, time, status) => upd((h) => {
    const l = arr(h, "medLog").filter((x) => !(x.medId === m.id && x.slot === `${day}|${time}`));
    let meds2 = arr(h, "meds");
    if (status === "taken") meds2 = meds2.map((x) => (x.id === m.id ? { ...x, stock: Math.max(0, (x.stock || 0) - (x.unitsPerDose || 1)) } : x));
    return { ...h, medLog: [...l, { id: uidW(), medId: m.id, at: nowISO(), slot: `${day}|${time}`, status }].slice(-1500), meds: meds2 };
  });
  const daysLeft = (m) => { const perDay = (m.unitsPerDose || 1) * Math.max(1, (m.times || []).length); return Math.floor((m.stock || 0) / perDay); };
  return (
    <Page title={t("Medicamentos")} onBack={onBack} action={<AddBtn label={t("Novo")} onClick={() => setEdit({})} />}>
      {meds.length === 0 && <Empty text={t("Adicione medicamentos, vitaminas ou pílulas para receber alertas e controlar o stock.")} />}
      {meds.map((m) => {
        const left = daysLeft(m), low = left <= (m.lowDays ?? 7);
        return (
          <Card key={m.id}>
            <div className="flex items-start gap-2">
              <Pill size={18} color={C.primary} className="mt-0.5" />
              <div className="flex-1 min-w-0"><div className="font-semibold" style={{ color: C.ink }}>{m.name}</div><div className="text-xs" style={{ color: C.inkSoft }}>{m.dose} · {(m.times || []).join(", ")}</div></div>
              <button className="text-xs font-semibold" style={{ color: C.primary }} onClick={() => setEdit(m)}>{t("Editar")}</button>
            </div>
            <div className="mt-3 space-y-1.5">
              {(m.times || []).map((tm) => {
                const l = doneSlot(m, tm);
                return (
                  <div key={tm} className="flex items-center gap-2 text-sm">
                    <span className="w-14 font-semibold" style={{ color: C.ink }}>{tm}</span>
                    {l ? <span className="flex-1 text-xs" style={{ color: l.status === "taken" ? C.primary : C.inkSoft }}>{l.status === "taken" ? `✔ ${t("Tomado")}` : `✖ ${t("Saltado")}`}</span> : <span className="flex-1" />}
                    <button onClick={() => mark(m, tm, "taken")} className="px-3 py-1 rounded-lg text-xs font-semibold" style={{ background: C.primarySoft, color: C.primary }}>{t("Tomei")}</button>
                    <button onClick={() => mark(m, tm, "skipped")} className="px-3 py-1 rounded-lg text-xs font-semibold" style={{ background: C.surfaceSunk, color: C.inkSoft }}>{t("Saltei")}</button>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 p-2.5 rounded-xl flex items-center justify-between" style={{ background: low ? C.dangerSoft : C.surfaceSunk }}>
              <div className="text-xs" style={{ color: low ? C.danger : C.inkSoft }}>
                {low ? "⚠ " : ""}{t("Stock")}: {m.stock || 0} · {left <= 0 ? t("acabou") : t("para ~{n} dias", { n: left })}
              </div>
              <button onClick={() => setRestock(m)} className="text-xs font-semibold" style={{ color: C.primary }}>{t("Repor stock")}</button>
            </div>
          </Card>
        );
      })}
      {log.length > 0 && (
        <Card>
          <div className="font-bold mb-2 text-sm" style={{ color: C.ink }}>{t("Histórico de tomas")}</div>
          <div className="space-y-1">
            {[...log].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 12).map((l) => (
              <div key={l.id} className="flex justify-between text-xs" style={{ color: C.inkSoft }}>
                <span>{meds.find((m) => m.id === l.medId)?.name || "—"}</span>
                <span>{new Date(l.at).toLocaleString(locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {l.status === "taken" ? "✔" : "✖"}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
      {edit && <MedModal med={edit} onClose={() => setEdit(null)} onSave={(m, remind) => {
        const id = m.id || uidW();
        const title = `💊 ${m.name}${m.dose ? ` (${m.dose})` : ""}`;
        const desired = remind && m.active !== false ? (m.times || []).map((tm) => ({ ...mkTask({ title, dueAt: nextAt(tm), recurrence: { type: "daily" }, alarmMode: true }), key: tm, keepDue: true })) : [];
        onSyncTasks({ type: "med", id }, desired, m.taskIds || []);
        const saved = { ...m, id, taskIds: [], remind: !!remind };
        upd((h) => ({ ...h, meds: m.id ? arr(h, "meds").map((x) => (x.id === m.id ? saved : x)) : [...arr(h, "meds"), saved] }));
        setEdit(null);
      }} onDelete={(m) => { onSyncTasks({ type: "med", id: m.id }, [], m.taskIds || []); upd((h) => ({ ...h, meds: arr(h, "meds").filter((x) => x.id !== m.id) })); setEdit(null); }} />}
      {restock && <RestockModal med={restock} canExpense={!!addExpense} onClose={() => setRestock(null)} onSave={(qty, cents) => {
        upd((h) => ({ ...h, meds: arr(h, "meds").map((x) => (x.id === restock.id ? { ...x, stock: (x.stock || 0) + qty } : x)) }));
        if (cents > 0 && addExpense) addExpense(cents, `${t("Farmácia")}: ${restock.name}`);
        setRestock(null);
      }} />}
    </Page>
  );
}
function MedModal({ med, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ name: "", dose: "", times: ["08:00"], unitsPerDose: 1, stock: 0, lowDays: 7, active: true, ...med });
  const [remind, setRemind] = useState(med.id ? !!med.remind : true);
  const setTime = (i, v) => setF({ ...f, times: f.times.map((x, j) => (j === i ? v : x)) });
  return (
    <Sheet title={med.id ? t("Editar medicamento") : t("Novo medicamento")} onClose={onClose}
      footer={<>{med.id && <Btn kind="danger" onClick={() => onDelete(med)}>{t("Apagar")}</Btn>}<Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn><Btn disabled={!f.name.trim() || !f.times.length} onClick={() => onSave({ ...f, name: f.name.trim() }, remind)}>{t("Guardar")}</Btn></>}>
      <Field label={t("Nome")}><input className={inputCls} style={inputSt} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label={t("Dose (ex.: 1 comprimido, 500 mg)")}><input className={inputCls} style={inputSt} value={f.dose} onChange={(e) => setF({ ...f, dose: e.target.value })} /></Field>
      <Field label={t("Horários")}>
        <div className="space-y-2">
          {f.times.map((tm, i) => (
            <div key={i} className="flex gap-2"><input type="time" className={inputCls} style={inputSt} value={tm} onChange={(e) => setTime(i, e.target.value)} />
              {f.times.length > 1 && <button onClick={() => setF({ ...f, times: f.times.filter((_, j) => j !== i) })} style={{ color: C.inkSoft }}><X size={16} /></button>}</div>
          ))}
          <button className="text-xs font-semibold" style={{ color: C.primary }} onClick={() => setF({ ...f, times: [...f.times, "20:00"] })}>+ {t("Horário")}</button>
        </div>
      </Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label={t("Unid./toma")}><input type="number" min={0.25} step={0.25} className={inputCls} style={inputSt} value={f.unitsPerDose} onChange={(e) => setF({ ...f, unitsPerDose: Number(e.target.value) || 1 })} /></Field>
        <Field label={t("Stock")}><input type="number" min={0} className={inputCls} style={inputSt} value={f.stock} onChange={(e) => setF({ ...f, stock: Number(e.target.value) || 0 })} /></Field>
        <Field label={t("Avisar com (dias)")}><input type="number" min={1} className={inputCls} style={inputSt} value={f.lowDays} onChange={(e) => setF({ ...f, lowDays: Number(e.target.value) || 7 })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm" style={{ color: C.ink }}><input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />{t("Lembrete diário com alarme (cria uma tarefa repetida)")}</label>
    </Sheet>
  );
}
function RestockModal({ med, onClose, onSave, canExpense }) {
  const [qty, setQty] = useState(30); const [price, setPrice] = useState("");
  return (
    <Sheet title={`${t("Repor stock")} · ${med.name}`} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn><Btn disabled={qty <= 0} onClick={() => onSave(qty, F.toCents(price))}>{t("Guardar")}</Btn></>}>
      <Field label={t("Quantidade comprada")}><input type="number" min={1} className={inputCls} style={inputSt} value={qty} onChange={(e) => setQty(Number(e.target.value) || 0)} /></Field>
      {canExpense && <Field label={t("Preço pago (regista despesa em Finanças)")}><input className={inputCls} style={inputSt} inputMode="decimal" placeholder="0,00" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>}
    </Sheet>
  );
}

/* ------------------------------ 2. Consultas e exames ------------------------------ */
const APPT_KINDS = [["consulta", "Consulta"], ["exame", "Exame"]];
function Appts({ hx, upd, onBack, onSyncTasks, onOpenAttachment }) {
  const items = arr(hx, "appts");
  const [edit, setEdit] = useState(null);
  const day = today();
  const sorted = [...items].sort((a, b) => (a.date > b.date ? 1 : -1));
  const upcoming = sorted.filter((x) => x.status !== "realizada");
  const done = sorted.filter((x) => x.status === "realizada").reverse();
  const renew = (x) => (x.validityMonths ? F.addMonthsISO(x.date, x.validityMonths) : null);
  const Row = ({ x }) => {
    const rn = x.status === "realizada" ? renew(x) : null;
    const overdue = rn && rn < day;
    return (
      <Card className="!p-3">
        <div className="flex items-start gap-2">
          <Stethoscope size={16} color={C.primary} className="mt-1" />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm" style={{ color: C.ink }}>{x.title}{x.specialty ? ` · ${x.specialty}` : ""}</div>
            <div className="text-xs" style={{ color: x.status !== "realizada" && x.date < day ? C.danger : C.inkSoft }}>{x.date}{x.time ? ` ${x.time}` : ""}{x.place ? ` · ${x.place}` : ""} · {t(x.kind === "exame" ? "Exame" : "Consulta")}</div>
            {rn && <div className="text-xs font-semibold" style={{ color: overdue ? C.danger : C.inkSoft }}>{overdue ? "⚠ " : ""}{t("Renovar até")} {rn}</div>}
            {x.notes && <div className="text-xs mt-1" style={{ color: C.inkSoft }}>{x.notes}</div>}
            {(x.attachments || []).length > 0 && <div className="flex gap-1.5 mt-1.5 flex-wrap">{x.attachments.map((a) => <button key={a.id} onClick={() => onOpenAttachment(a)} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg" style={{ background: C.surfaceSunk, color: C.ink }}><Paperclip size={11} />{(a.name || t("Anexo")).slice(0, 18)}</button>)}</div>}
          </div>
          <button className="text-xs font-semibold" style={{ color: C.primary }} onClick={() => setEdit(x)}>{t("Editar")}</button>
        </div>
        {x.status !== "realizada" && <button className="mt-2 text-xs font-semibold" style={{ color: C.primary }} onClick={() => { onSyncTasks({ type: "appt", id: x.id }, [], x.taskId ? [x.taskId] : []); upd((h) => ({ ...h, appts: arr(h, "appts").map((y) => (y.id === x.id ? { ...y, status: "realizada", taskId: null } : y)) })); }}>✔ {t("Marcar como realizada")}</button>}
        {rn && <button className="mt-2 ml-3 text-xs font-semibold" style={{ color: C.primary }} onClick={() => setEdit({ ...x, id: null, status: "agendada", date: rn, taskId: null, attachments: [] })}>{t("Agendar novo")}</button>}
      </Card>
    );
  };
  return (
    <Page title={t("Consultas e exames")} onBack={onBack} action={<AddBtn label={t("Novo")} onClick={() => setEdit({ kind: "consulta" })} />}>
      {items.length === 0 && <Empty text={t("Registe consultas e exames; defina a validade de exames de rotina para ser avisado quando renovar.")} />}
      {upcoming.length > 0 && <div className="space-y-2"><div className="text-xs font-bold uppercase" style={{ color: C.inkSoft }}>{t("Agendadas")}</div>{upcoming.map((x) => <Row key={x.id} x={x} />)}</div>}
      {done.length > 0 && <div className="space-y-2"><div className="text-xs font-bold uppercase" style={{ color: C.inkSoft }}>{t("Histórico")}</div>{done.map((x) => <Row key={x.id} x={x} />)}</div>}
      {edit && <ApptModal item={edit} onClose={() => setEdit(null)} onDelete={(x) => { onSyncTasks({ type: "appt", id: x.id }, [], x.taskId ? [x.taskId] : []); upd((h) => ({ ...h, appts: arr(h, "appts").filter((y) => y.id !== x.id) })); setEdit(null); }}
        onSave={(x, remind) => {
          const id = x.id || uidW();
          const due = new Date(`${x.date}T${x.time || "09:00"}:00`);
          const desired = remind && x.status !== "realizada" && due.getTime() > Date.now()
            ? [{ ...mkTask({ title: `🩺 ${x.title}`, description: x.place || "", dueAt: due.toISOString(), reminders: [{ id: uidW(), value: 1, unit: "days" }, { id: uidW(), value: 2, unit: "hours" }] }), key: "appt", keepDue: false }] : [];
          onSyncTasks({ type: "appt", id }, desired, x.taskId ? [x.taskId] : []);
          const saved = { ...x, id, taskId: null };
          upd((h) => ({ ...h, appts: x.id ? arr(h, "appts").map((y) => (y.id === x.id ? saved : y)) : [...arr(h, "appts"), saved] }));
          setEdit(null);
        }} />}
    </Page>
  );
}
function ApptModal({ item, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ kind: "consulta", title: "", specialty: "", date: today(), time: "", place: "", notes: "", status: "agendada", validityMonths: 0, attachments: [], ...item });
  const [remind, setRemind] = useState(true);
  const add = async (e) => { const file = e.target.files?.[0]; if (!file) return; try { const a = await shrinkImage(file); setF((p) => ({ ...p, attachments: [...p.attachments, { id: uidW(), ...a }] })); } catch (err) { /* ignore */ } e.target.value = ""; };
  return (
    <Sheet title={item.id ? t("Editar") : t("Novo registo")} onClose={onClose}
      footer={<>{item.id && <Btn kind="danger" onClick={() => onDelete(item)}>{t("Apagar")}</Btn>}<Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn><Btn disabled={!f.title.trim()} onClick={() => onSave({ ...f, title: f.title.trim() }, remind)}>{t("Guardar")}</Btn></>}>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl" style={{ background: C.surfaceSunk }}>
        {APPT_KINDS.map(([id, l]) => <button key={id} onClick={() => setF({ ...f, kind: id })} className="py-2 rounded-lg text-sm font-semibold" style={{ background: f.kind === id ? C.surface : "transparent", color: f.kind === id ? C.primary : C.inkSoft }}>{t(l)}</button>)}
      </div>
      <Field label={t("Título (ex.: Dentista, Análises ao sangue)")}><input className={inputCls} style={inputSt} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Data")}><input type="date" className={inputCls} style={inputSt} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label={t("Hora")}><input type="time" className={inputCls} style={inputSt} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} /></Field>
      </div>
      <Field label={t("Especialidade / médico")}><input className={inputCls} style={inputSt} value={f.specialty} onChange={(e) => setF({ ...f, specialty: e.target.value })} /></Field>
      <Field label={t("Local")}><input className={inputCls} style={inputSt} value={f.place} onChange={(e) => setF({ ...f, place: e.target.value })} /></Field>
      <Field label={t("Validade / repetir a cada (meses, 0 = não)")}><input type="number" min={0} max={60} className={inputCls} style={inputSt} value={f.validityMonths} onChange={(e) => setF({ ...f, validityMonths: Number(e.target.value) || 0 })} /></Field>
      <Field label={t("Notas")}><textarea rows={2} className={inputCls} style={inputSt} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <Field label={t("Relatórios e receitas")}>
        <div className="flex gap-1.5 flex-wrap mb-2">{f.attachments.map((a) => <span key={a.id} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg" style={{ background: C.surfaceSunk, color: C.ink }}>{(a.name || "").slice(0, 16)}<button onClick={() => setF({ ...f, attachments: f.attachments.filter((x) => x.id !== a.id) })}><X size={11} /></button></span>)}</div>
        <input type="file" accept="image/*,application/pdf" capture={undefined} onChange={add} className="text-xs" />
      </Field>
      {f.status !== "realizada" && <label className="flex items-center gap-2 text-sm" style={{ color: C.ink }}><input type="checkbox" checked={remind} onChange={(e) => setRemind(e.target.checked)} />{t("Lembrar 1 dia e 2 horas antes (cria uma tarefa)")}</label>}
    </Sheet>
  );
}

/* ------------------------------ 3. Biometria ------------------------------ */
const VITAL_DEFS = [["weight", "Peso", "kg"], ["bmi", "IMC", ""], ["sys", "Tensão (sist.)", " mmHg"], ["dia", "Tensão (diast.)", " mmHg"], ["hr", "Pulso em repouso", " bpm"], ["glucose", "Glicemia", " mg/dL"]];
const bmiOf = (w, h) => (w && h ? Math.round((w / ((h / 100) ** 2)) * 10) / 10 : null);
const bmiClass = (b) => (b < 18.5 ? "Abaixo do peso" : b < 25 ? "Peso normal" : b < 30 ? "Excesso de peso" : "Obesidade");
function Vitals({ hx, upd, onBack }) {
  const list = [...arr(hx, "vitals")].sort((a, b) => (a.at > b.at ? 1 : -1));
  const [metric, setMetric] = useState("weight");
  const [add, setAdd] = useState(false);
  const lastH = [...list].reverse().find((v) => v.height)?.height;
  const val = (v, k) => (k === "bmi" ? bmiOf(v.weight, v.height || lastH) : v[k]);
  const pts = list.map((v) => ({ d: v.at, v: val(v, metric) })).filter((p) => p.v != null).slice(-30);
  const unit = VITAL_DEFS.find((d) => d[0] === metric)[2];
  const latest = [...list].reverse().find((v) => val(v, metric) != null);
  const bmi = latest ? bmiOf([...list].reverse().find((v) => v.weight)?.weight, lastH) : null;
  return (
    <Page title={t("Biometria")} onBack={onBack} action={<AddBtn label={t("Registar")} onClick={() => setAdd(true)} />}>
      <div className="flex gap-1 overflow-x-auto p-1 rounded-xl" style={{ background: C.surfaceSunk, scrollbarWidth: "none" }}>
        {VITAL_DEFS.map(([k, l]) => <button key={k} onClick={() => setMetric(k)} className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: metric === k ? C.surface : "transparent", color: metric === k ? C.primary : C.inkSoft }}>{t(l)}</button>)}
      </div>
      <Card>
        <div className="flex items-baseline justify-between mb-2"><div className="text-2xl font-bold" style={{ color: C.ink }}>{latest ? `${val(latest, metric)}${unit}` : "—"}</div>{metric === "bmi" && bmi && <div className="text-xs font-semibold" style={{ color: C.inkSoft }}>{t(bmiClass(bmi))}</div>}</div>
        <Line points={pts} unit={unit} />
      </Card>
      {list.length > 0 && <Card><div className="font-bold text-sm mb-2" style={{ color: C.ink }}>{t("Registos")}</div>
        {[...list].reverse().slice(0, 10).map((v) => (
          <div key={v.id} className="flex items-center justify-between text-xs py-1" style={{ color: C.inkSoft }}>
            <span>{fmtDay(v.at)}</span>
            <span className="flex-1 text-right pr-2">{[v.weight && `${v.weight} kg`, v.sys && `${v.sys}/${v.dia}`, v.hr && `${v.hr} bpm`, v.glucose && `${v.glucose} mg/dL`].filter(Boolean).join(" · ")}</span>
            <Del onClick={() => upd((h) => ({ ...h, vitals: arr(h, "vitals").filter((x) => x.id !== v.id) }))} />
          </div>))}
      </Card>}
      <div className="text-[11px]" style={{ color: C.inkSoft }}>{t("Informação para acompanhamento pessoal; não substitui aconselhamento médico.")}</div>
      {add && <VitalModal lastH={lastH} onClose={() => setAdd(false)} onSave={(v) => { upd((h) => ({ ...h, vitals: [...arr(h, "vitals"), { id: uidW(), at: nowISO(), ...v }] })); setAdd(false); }} />}
    </Page>
  );
}
function VitalModal({ lastH, onClose, onSave }) {
  const [f, setF] = useState({ weight: "", height: lastH || "", sys: "", dia: "", hr: "", glucose: "" });
  const n = (k) => (f[k] === "" ? undefined : Number(String(f[k]).replace(",", ".")));
  const out = { weight: n("weight"), height: n("height"), sys: n("sys"), dia: n("dia"), hr: n("hr"), glucose: n("glucose") };
  const any = Object.values(out).some((v) => v != null && !Number.isNaN(v));
  const inp = (k, label, ph) => <Field label={label}><input className={inputCls} style={inputSt} inputMode="decimal" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>;
  return (
    <Sheet title={t("Novo registo")} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn><Btn disabled={!any} onClick={() => onSave(Object.fromEntries(Object.entries(out).filter(([, v]) => v != null && !Number.isNaN(v))))}>{t("Guardar")}</Btn></>}>
      <div className="grid grid-cols-2 gap-3">{inp("weight", t("Peso (kg)"), "70")}{inp("height", t("Altura (cm)"), "170")}{inp("sys", t("Tensão sistólica"), "120")}{inp("dia", t("Tensão diastólica"), "80")}{inp("hr", t("Pulso (bpm)"), "65")}{inp("glucose", t("Glicemia (mg/dL)"), "95")}</div>
    </Sheet>
  );
}

/* ------------------------------ 4. Sono ------------------------------ */
const hoursBetween = (bed, wake) => { const [bh, bm] = bed.split(":").map(Number), [wh, wm] = wake.split(":").map(Number); let m = wh * 60 + wm - (bh * 60 + bm); if (m <= 0) m += 1440; return Math.round((m / 60) * 10) / 10; };
const QUALITY = ["😫", "😕", "😐", "🙂", "😄"];
function Sleep({ hx, upd, onBack, tasks }) {
  const list = arr(hx, "sleep");
  const [add, setAdd] = useState(false);
  const days = lastDays(7);
  const by = (d) => list.find((s) => s.date === d);
  const avg = (() => { const v = list.slice(-7); return v.length ? Math.round((v.reduce((s, x) => s + x.hours, 0) / v.length) * 10) / 10 : null; })();
  const doneOn = (d) => (tasks || []).filter((x) => x.completedAt && dOf(x.completedAt) === d).length;
  const good = list.filter((s) => s.quality >= 4), poor = list.filter((s) => s.quality <= 2);
  const mean = (a) => (a.length ? Math.round((a.reduce((s, x) => s + doneOn(x.date), 0) / a.length) * 10) / 10 : null);
  return (
    <Page title={t("Sono")} onBack={onBack} action={<AddBtn label={t("Registar")} onClick={() => setAdd(true)} />}>
      <Card>
        <div className="text-xs font-semibold" style={{ color: C.inkSoft }}>{t("Média dos últimos registos")}</div>
        <div className="text-2xl font-bold" style={{ color: C.ink }}>{avg != null ? `${avg} h` : "—"}</div>
        <div className="flex items-end gap-2 h-24 mt-3">
          {days.map((d) => { const s = by(d); return (
            <div key={d} className="flex-1 flex flex-col items-center justify-end h-full">
              <div className="text-[10px]" style={{ color: C.inkSoft }}>{s ? s.hours : ""}</div>
              <div className="w-full rounded-t-md" style={{ height: `${s ? Math.min(100, (s.hours / 10) * 100) : 3}%`, background: s ? (s.hours >= 7 ? C.primary : C.q3) : C.surfaceSunk }} />
              <div className="text-[10px] mt-1" style={{ color: C.inkSoft }}>{new Date(`${d}T12:00:00`).toLocaleDateString(locale(), { weekday: "narrow" })}</div>
            </div>); })}
        </div>
      </Card>
      {(good.length > 0 && poor.length > 0) && (
        <Card><div className="text-sm font-bold mb-1" style={{ color: C.ink }}>{t("Sono vs. produtividade")}</div>
          <div className="text-xs" style={{ color: C.inkSoft }}>{t("Tarefas concluídas por dia: {a} após boas noites (4–5) e {b} após noites fracas (1–2).", { a: mean(good), b: mean(poor) })}</div></Card>
      )}
      {list.length === 0 && <Empty text={t("Registe a hora de deitar, de acordar e como dormiu.")} />}
      {[...list].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 10).map((s) => (
        <Card key={s.id} className="!p-3 flex items-center gap-3"><div className="text-2xl">{QUALITY[s.quality - 1]}</div>
          <div className="flex-1"><div className="text-sm font-semibold" style={{ color: C.ink }}>{s.hours} h</div><div className="text-xs" style={{ color: C.inkSoft }}>{fmtDay(s.date)} · {s.bed} → {s.wake}</div></div>
          <Del onClick={() => upd((h) => ({ ...h, sleep: arr(h, "sleep").filter((x) => x.id !== s.id) }))} /></Card>
      ))}
      {add && <SleepModal onClose={() => setAdd(false)} onSave={(s) => { upd((h) => ({ ...h, sleep: [...arr(h, "sleep").filter((x) => x.date !== s.date), { id: uidW(), ...s }] })); setAdd(false); }} />}
    </Page>
  );
}
function SleepModal({ onClose, onSave }) {
  const [date, setDate] = useState(today()); const [bed, setBed] = useState("23:00"); const [wake, setWake] = useState("07:00"); const [q, setQ] = useState(3);
  return (
    <Sheet title={t("Registar sono")} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn><Btn onClick={() => onSave({ date, bed, wake, quality: q, hours: hoursBetween(bed, wake) })}>{t("Guardar")}</Btn></>}>
      <Field label={t("Acordei em")}><input type="date" className={inputCls} style={inputSt} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3"><Field label={t("Deitei-me")}><input type="time" className={inputCls} style={inputSt} value={bed} onChange={(e) => setBed(e.target.value)} /></Field><Field label={t("Acordei")}><input type="time" className={inputCls} style={inputSt} value={wake} onChange={(e) => setWake(e.target.value)} /></Field></div>
      <div className="text-sm" style={{ color: C.inkSoft }}>{hoursBetween(bed, wake)} h</div>
      <Field label={t("Qualidade do sono")}><div className="flex justify-between">{QUALITY.map((e, i) => <button key={i} onClick={() => setQ(i + 1)} className="text-3xl p-1.5 rounded-xl" style={{ background: q === i + 1 ? C.primarySoft : "transparent" }}>{e}</button>)}</div></Field>
    </Sheet>
  );
}

/* ------------------------------ 5. Humor ------------------------------ */
const MOODS = ["😞", "😟", "😐", "🙂", "😄"];
const MOOD_TAGS = ["Trabalho", "Família", "Saúde", "Social", "Dinheiro", "Cansaço", "Stress", "Ansiedade"];
function Mood({ hx, upd, onBack }) {
  const list = arr(hx, "mood");
  const [add, setAdd] = useState(false);
  const days = lastDays(28);
  const byDay = (d) => { const e = list.filter((m) => dOf(m.at) === d); return e.length ? Math.round(e.reduce((s, m) => s + m.mood, 0) / e.length) : null; };
  const recent = list.filter((m) => dOf(m.at) >= days[0]);
  const avg = recent.length ? Math.round((recent.reduce((s, m) => s + m.mood, 0) / recent.length) * 10) / 10 : null;
  const tagStats = {}; recent.forEach((m) => (m.tags || []).forEach((g) => { (tagStats[g] = tagStats[g] || []).push(m.mood); }));
  const ranked = Object.entries(tagStats).map(([g, v]) => [g, v.length, v.reduce((a, b) => a + b, 0) / v.length]).sort((a, b) => b[1] - a[1]).slice(0, 4);
  return (
    <Page title={t("Humor")} onBack={onBack} action={<AddBtn label={t("Como me sinto")} onClick={() => setAdd(true)} />}>
      <Card>
        <div className="flex justify-between items-baseline mb-3"><div className="font-bold text-sm" style={{ color: C.ink }}>{t("Últimas 4 semanas")}</div><div className="text-xs" style={{ color: C.inkSoft }}>{t("Média")}: {avg ?? "—"} / 5</div></div>
        <div className="grid grid-cols-7 gap-1.5">{days.map((d) => { const m = byDay(d); return <div key={d} className="aspect-square rounded-lg flex items-center justify-center text-lg" style={{ background: m ? C.primarySoft : C.surfaceSunk, opacity: m ? 1 : 0.6 }} title={d}>{m ? MOODS[m - 1] : ""}</div>; })}</div>
      </Card>
      {ranked.length > 0 && <Card><div className="font-bold text-sm mb-2" style={{ color: C.ink }}>{t("O que mais pesa")}</div>
        {ranked.map(([g, n, a]) => <div key={g} className="flex justify-between text-xs py-0.5" style={{ color: C.inkSoft }}><span>{t(g)} ({n}×)</span><span>{MOODS[Math.round(a) - 1]} {Math.round(a * 10) / 10}</span></div>)}</Card>}
      {list.length === 0 && <Empty text={t("Um registo rápido por dia ajuda a perceber padrões de stress e ansiedade.")} />}
      {[...list].sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 10).map((m) => (
        <Card key={m.id} className="!p-3 flex items-start gap-3"><div className="text-2xl">{MOODS[m.mood - 1]}</div>
          <div className="flex-1 min-w-0"><div className="text-xs" style={{ color: C.inkSoft }}>{new Date(m.at).toLocaleString(locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
            {(m.tags || []).length > 0 && <div className="text-xs font-semibold" style={{ color: C.ink }}>{m.tags.map((g) => t(g)).join(" · ")}</div>}{m.note && <div className="text-sm" style={{ color: C.ink }}>{m.note}</div>}</div>
          <Del onClick={() => upd((h) => ({ ...h, mood: arr(h, "mood").filter((x) => x.id !== m.id) }))} /></Card>
      ))}
      {add && <MoodModal onClose={() => setAdd(false)} onSave={(m) => { upd((h) => ({ ...h, mood: [...arr(h, "mood"), { id: uidW(), at: nowISO(), ...m }] })); setAdd(false); }} />}
    </Page>
  );
}
function MoodModal({ onClose, onSave }) {
  const [mood, setMood] = useState(3); const [tags, setTags] = useState([]); const [note, setNote] = useState("");
  return (
    <Sheet title={t("Como se sente?")} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn><Btn onClick={() => onSave({ mood, tags, note: note.trim() })}>{t("Guardar")}</Btn></>}>
      <div className="flex justify-between">{MOODS.map((e, i) => <button key={i} onClick={() => setMood(i + 1)} className="text-3xl p-1.5 rounded-xl" style={{ background: mood === i + 1 ? C.primarySoft : "transparent" }}>{e}</button>)}</div>
      <Field label={t("Porquê?")}><div className="flex flex-wrap gap-1.5">{MOOD_TAGS.map((g) => <button key={g} onClick={() => setTags(tags.includes(g) ? tags.filter((x) => x !== g) : [...tags, g])} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: tags.includes(g) ? C.primary : C.surfaceSunk, color: tags.includes(g) ? "#fff" : C.inkSoft }}>{t(g)}</button>)}</div></Field>
      <Field label={t("Nota (opcional)")}><textarea rows={2} className={inputCls} style={inputSt} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Sheet>
  );
}

/* ------------------------------ 6. Pausas e respiração ------------------------------ */
const PATTERNS = [["4-7-8", "4-7-8 (relaxar)", [["Inspire", 4], ["Segure", 7], ["Expire", 8]]], ["box", "Caixa 4-4-4-4 (foco)", [["Inspire", 4], ["Segure", 4], ["Expire", 4], ["Segure", 4]]], ["coh", "Coerente 5-5 (calma)", [["Inspire", 5], ["Expire", 5]]]];
const BREAKS = ["Levante-se e alongue o pescoço e os ombros", "Olhe para longe (20 m) durante 20 segundos", "Caminhe até à janela e respire fundo", "Beba um copo de água"];
function Breath({ hx, upd, onBack }) {
  const [pat, setPat] = useState(PATTERNS[0]);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(0); const [left, setLeft] = useState(0); const [secs, setSecs] = useState(0);
  const [mins, setMins] = useState(5); const [pauseLeft, setPauseLeft] = useState(0);
  const st = useRef({});
  useEffect(() => {
    if (!running) return undefined;
    const steps = pat[2];
    st.current = { i: 0, c: steps[0][1] }; setPhase(0); setLeft(steps[0][1]); setSecs(0);
    const iv = setInterval(() => {
      const s = st.current; s.c -= 1;
      if (s.c <= 0) { s.i = (s.i + 1) % steps.length; s.c = steps[s.i][1]; }
      setPhase(s.i); setLeft(s.c); setSecs((x) => x + 1);
    }, 1000);
    return () => clearInterval(iv);
  }, [running, pat]);
  useEffect(() => {
    if (pauseLeft <= 0) return undefined;
    const iv = setInterval(() => setPauseLeft((x) => Math.max(0, x - 1)), 1000);
    return () => clearInterval(iv);
  }, [pauseLeft > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const stop = () => { setRunning(false); if (secs >= 20) upd((h) => ({ ...h, breath: [...arr(h, "breath"), { id: uidW(), at: nowISO(), secs, pattern: pat[0] }].slice(-500) })); };
  const step = pat[2][phase] || pat[2][0];
  let bigNow = false;
  if (running) { for (let k = 0; k < pat[2].length; k++) { const nm = pat[2][(phase - k + pat[2].length * 2) % pat[2].length][0]; if (nm !== "Segure") { bigNow = nm === "Inspire"; break; } } }
  const todayN = arr(hx, "breath").filter((b) => dOf(b.at) === today()).length;
  const mm = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return (
    <Page title={t("Pausas e respiração")} onBack={onBack}>
      <Card className="text-center">
        <div className="flex gap-1 overflow-x-auto p-1 rounded-xl mb-4" style={{ background: C.surfaceSunk, scrollbarWidth: "none" }}>
          {PATTERNS.map((p) => <button key={p[0]} disabled={running} onClick={() => setPat(p)} className="flex-shrink-0 px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: pat[0] === p[0] ? C.surface : "transparent", color: pat[0] === p[0] ? C.primary : C.inkSoft }}>{t(p[1])}</button>)}
        </div>
        <div className="mx-auto flex items-center justify-center rounded-full" style={{ width: 170, height: 170, background: C.primarySoft, transform: `scale(${bigNow ? 1 : 0.7})`, transition: `transform ${running ? step[1] : 0.4}s ease-in-out` }}>
          <div className="text-center" style={{ transform: "scale(1)" }}><div className="font-bold text-lg" style={{ color: C.primary }}>{running ? t(step[0]) : t("Pronto")}</div>{running && <div className="text-3xl font-bold" style={{ color: C.ink }}>{left}</div>}</div>
        </div>
        <div className="mt-5">{running ? <Btn kind="ghost" onClick={stop}>{t("Terminar")} · {mm(secs)}</Btn> : <Btn onClick={() => setRunning(true)}>{t("Começar")}</Btn>}</div>
        <div className="text-xs mt-3" style={{ color: C.inkSoft }}>{t("Sessões hoje")}: {todayN}</div>
      </Card>
      <Card>
        <div className="font-bold text-sm mb-2" style={{ color: C.ink }}>{t("Pausa ativa")}</div>
        {pauseLeft > 0 ? <div className="text-center"><div className="text-3xl font-bold" style={{ color: C.ink }}>{mm(pauseLeft)}</div><div className="text-sm mt-1" style={{ color: C.inkSoft }}>{t(BREAKS[Math.floor(Date.now() / 60000) % BREAKS.length])}</div><div className="mt-3"><Btn kind="ghost" onClick={() => setPauseLeft(0)}>{t("Parar")}</Btn></div></div>
          : <div className="flex items-center gap-2"><select className={inputCls} style={inputSt} value={mins} onChange={(e) => setMins(Number(e.target.value))}>{[2, 5, 10, 15].map((m) => <option key={m} value={m}>{m} min</option>)}</select><Btn onClick={() => setPauseLeft(mins * 60)}>{t("Iniciar pausa")}</Btn></div>}
      </Card>
    </Page>
  );
}

/* ------------------------------ 7. Atividade física ------------------------------ */
const WORK_TYPES = ["Musculação", "Corrida", "Natação", "Caminhada", "Ciclismo", "Yoga", "Outro"];
function Workouts({ hx, upd, onBack }) {
  const list = arr(hx, "workouts");
  const [add, setAdd] = useState(false);
  const week = lastDays(7);
  const daysWith = new Set(list.map((w) => w.date));
  const weekN = week.filter((d) => daysWith.has(d)).length;
  const weekMin = list.filter((w) => w.date >= week[0]).reduce((s, w) => s + (w.minutes || 0), 0);
  let streak = 0; for (let i = 0; ; i++) { const d = F.addDaysISO(today(), -i); if (daysWith.has(d)) streak++; else if (i === 0) continue; else break; }
  return (
    <Page title={t("Atividade física")} onBack={onBack} action={<AddBtn label={t("Treino")} onClick={() => setAdd(true)} />}>
      <div className="grid grid-cols-3 gap-3">
        <Card className="text-center"><div className="text-2xl font-bold" style={{ color: C.primary }}>{weekN}</div><div className="text-[11px]" style={{ color: C.inkSoft }}>{t("dias ativos (7 d)")}</div></Card>
        <Card className="text-center"><div className="text-2xl font-bold" style={{ color: C.ink }}>{weekMin}</div><div className="text-[11px]" style={{ color: C.inkSoft }}>{t("minutos (7 d)")}</div></Card>
        <Card className="text-center"><div className="text-2xl font-bold" style={{ color: C.accent }}>{streak}</div><div className="text-[11px]" style={{ color: C.inkSoft }}>{t("dias seguidos")}</div></Card>
      </div>
      <div className="flex gap-1.5">{week.map((d) => <div key={d} className="flex-1 h-8 rounded-lg flex items-center justify-center text-xs" style={{ background: daysWith.has(d) ? C.primary : C.surfaceSunk, color: daysWith.has(d) ? "#fff" : C.inkSoft }}>{new Date(`${d}T12:00:00`).toLocaleDateString(locale(), { weekday: "narrow" })}</div>)}</div>
      {list.length === 0 && <Empty text={t("Registe o seu primeiro treino para acompanhar a consistência.")} />}
      {[...list].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 12).map((w) => (
        <Card key={w.id} className="!p-3 flex items-center gap-3"><Dumbbell size={18} color={C.primary} />
          <div className="flex-1 min-w-0"><div className="text-sm font-semibold" style={{ color: C.ink }}>{t(w.type)} · {w.minutes} min</div><div className="text-xs" style={{ color: C.inkSoft }}>{fmtDay(w.date)}{w.kcal ? ` · ${w.kcal} kcal` : ""}{w.load ? ` · ${w.load} kg` : ""}{w.notes ? ` · ${w.notes}` : ""}</div></div>
          <Del onClick={() => upd((h) => ({ ...h, workouts: arr(h, "workouts").filter((x) => x.id !== w.id) }))} /></Card>
      ))}
      {add && <WorkoutModal onClose={() => setAdd(false)} onSave={(w) => { upd((h) => ({ ...h, workouts: [...arr(h, "workouts"), { id: uidW(), ...w }] })); setAdd(false); }} />}
    </Page>
  );
}
function WorkoutModal({ onClose, onSave }) {
  const [f, setF] = useState({ type: WORK_TYPES[0], date: today(), minutes: 45, kcal: "", load: "", notes: "" });
  return (
    <Sheet title={t("Novo treino")} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn><Btn disabled={!(f.minutes > 0)} onClick={() => onSave({ type: f.type, date: f.date, minutes: Number(f.minutes), kcal: Number(f.kcal) || 0, load: Number(f.load) || 0, notes: f.notes.trim() })}>{t("Guardar")}</Btn></>}>
      <Field label={t("Tipo")}><select className={inputCls} style={inputSt} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{WORK_TYPES.map((w) => <option key={w} value={w}>{t(w)}</option>)}</select></Field>
      <Field label={t("Data")}><input type="date" className={inputCls} style={inputSt} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label={t("Minutos")}><input type="number" min={1} className={inputCls} style={inputSt} value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} /></Field>
        <Field label={t("Calorias")}><input type="number" min={0} className={inputCls} style={inputSt} value={f.kcal} onChange={(e) => setF({ ...f, kcal: e.target.value })} /></Field>
        <Field label={t("Carga (kg)")}><input type="number" min={0} className={inputCls} style={inputSt} value={f.load} onChange={(e) => setF({ ...f, load: e.target.value })} /></Field>
      </div>
      <Field label={t("Notas")}><input className={inputCls} style={inputSt} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Sheet>
  );
}

/* ------------------------------ 8. Refeições e jejum ------------------------------ */
const FAST_PROTOS = [12, 14, 16, 18, 20];
function Meals({ hx, upd, onBack, generateMealPlan }) {
  const meals = arr(hx, "meals"), fastLog = arr(hx, "fastLog"), fasting = hx.fasting;
  const [target, setTarget] = useState(16); const [adv, setAdv] = useState(false); const [kcal, setKcal] = useState(""); const [prot, setProt] = useState(""); const [carb, setCarb] = useState(""); const [fat, setFat] = useState("");
  const [, tick] = useState(0);
  useEffect(() => { if (!fasting) return undefined; const iv = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(iv); }, [fasting]);
  const day = today();
  const todayTag = meals.find((m) => m.date === day && m.tag);
  const setTag = (tag) => upd((h) => ({ ...h, meals: [...arr(h, "meals").filter((m) => !(m.date === day && m.tag)), { id: uidW(), date: day, tag }] }));
  const elapsed = fasting ? Math.max(0, Math.floor((Date.now() - new Date(fasting.startAt).getTime()) / 1000)) : 0;
  const goal = fasting ? fasting.targetH * 3600 : 1;
  const hms = (s) => `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m ${String(s % 60).padStart(2, "0")}s`;
  const endFast = () => upd((h) => ({ ...h, fastLog: [...arr(h, "fastLog"), { id: uidW(), start: h.fasting.startAt, end: nowISO(), targetH: h.fasting.targetH }].slice(-400), fasting: null }));
  const last7 = lastDays(7).map((d) => ({ d, tag: meals.find((m) => m.date === d && m.tag)?.tag }));
  const kcalToday = meals.filter((m) => m.date === day && m.kcal).reduce((s, m) => s + m.kcal, 0);
  const macro = meals.filter((m) => m.date === day).reduce((a, m) => ({ p: a.p + (m.protein || 0), c: a.c + (m.carb || 0), f: a.f + (m.fat || 0) }), { p: 0, c: 0, f: 0 });
  const plan = hx.mealPlan;
  const planToday = plan && plan.days.find((d) => d.date === day);
  const SLOT = { breakfast: "Pequeno-almoço", lunch: "Almoço", snack: "Lanche", dinner: "Jantar" };
  const [showPlan, setShowPlan] = useState(false);
  const [openDay, setOpenDay] = useState(null);
  const [regen, setRegen] = useState(false);
  const [regenErr, setRegenErr] = useState("");
  const hasQty = plan && plan.days.some((d) => d.meals.some((m) => (m.ingredients || []).length));
  const Meal = ({ m }) => (
    <div className="py-1.5">
      <div className="flex justify-between gap-2 text-sm" style={{ color: C.ink }}><span className="min-w-0 break-words"><span className="text-xs" style={{ color: C.inkSoft }}>{t(SLOT[m.slot] || m.slot)} · </span><b className="font-semibold">{m.name}</b></span><span className="text-xs flex-shrink-0" style={{ color: C.inkSoft }}>{m.kcal} kcal</span></div>
      {(m.ingredients || []).length > 0 && <ul className="mt-0.5 pl-3 text-xs space-y-0.5" style={{ color: C.inkSoft }}>{m.ingredients.map((g, i) => <li key={i}>• {g.item}{g.quantity ? ` — ${g.quantity}` : ""}</li>)}</ul>}
    </div>
  );
  const regenerate = async () => {
    setRegen(true); setRegenErr("");
    try { const np = await generateMealPlan({ kcalTarget: plan.kcalTarget, days: Math.min(30, Math.max(7, plan.days.length)), note: "" }); upd((h) => ({ ...h, mealPlan: np })); }
    catch (e) { setRegenErr(e.message || ""); }
    setRegen(false);
  };
  return (
    <Page title={t("Refeições e jejum")} onBack={onBack}>
      {plan && (
        <Card>
          <div className="flex items-center justify-between mb-2"><div className="font-bold text-sm" style={{ color: C.ink }}>🍎 {planToday ? t("Cardápio de hoje") : t("Plano de cardápio")}</div><div className="text-xs" style={{ color: C.inkSoft }}>~{plan.kcalTarget} kcal</div></div>
          {planToday ? <div className="divide-y" style={{ borderColor: C.border }}>{planToday.meals.map((m, i) => <Meal key={i} m={m} />)}</div>
            : <div className="text-xs" style={{ color: C.inkSoft }}>{t("O plano não cobre o dia de hoje.")}</div>}
          {!hasQty && generateMealPlan && (
            <div className="mt-2 p-2.5 rounded-xl text-xs" style={{ background: C.surfaceSunk, color: C.inkSoft }}>
              {t("Este plano não tem quantidades dos ingredientes.")}
              <div className="mt-1.5"><Btn kind="ghost" disabled={regen} onClick={regenerate}>{regen ? t("A gerar…") : t("Gerar de novo com quantidades")}</Btn></div>
              {regenErr && <div className="mt-1" style={{ color: C.danger }}>{regenErr}</div>}
            </div>
          )}
          <div className="flex gap-4 mt-2">
            <button className="text-xs font-semibold" style={{ color: C.primary }} onClick={() => setShowPlan(!showPlan)}>{showPlan ? t("Ocultar plano") : t("Ver plano completo")} ({plan.days.length} {t("dias")})</button>
            <button className="text-xs font-semibold" style={{ color: C.danger }} onClick={() => upd((h) => ({ ...h, mealPlan: null }))}>{t("Apagar plano")}</button>
          </div>
          {showPlan && (
            <div className="mt-3 space-y-1 max-h-96 overflow-y-auto">
              {plan.days.map((d) => (
                <div key={d.date} className="rounded-lg" style={{ background: openDay === d.date ? C.surfaceSunk : "transparent" }}>
                  <button className="w-full flex justify-between text-xs py-1.5 px-2" style={{ color: C.ink }} onClick={() => setOpenDay(openDay === d.date ? null : d.date)}>
                    <b>{fmtDay(d.date)}</b><span style={{ color: C.inkSoft }}>{d.meals.reduce((a, m) => a + m.kcal, 0)} kcal {openDay === d.date ? "▲" : "▼"}</span>
                  </button>
                  {openDay === d.date && <div className="px-2 pb-2">{d.meals.map((m, i) => <Meal key={i} m={m} />)}</div>}
                </div>
              ))}
            </div>
          )}
          <div className="text-[11px] mt-2" style={{ color: C.inkSoft }}>{t("Sugestão gerada por IA; não substitui um nutricionista.")}</div>
        </Card>
      )}
      <Card>
        <div className="font-bold text-sm mb-3" style={{ color: C.ink }}>{t("Jejum intermitente")}</div>
        {fasting ? (
          <div className="text-center">
            <div className="text-3xl font-bold" style={{ color: elapsed >= goal ? C.primary : C.ink }}>{hms(elapsed)}</div>
            <div className="my-3"><Bar pct={elapsed / goal} color={C.primary} /></div>
            <div className="text-xs mb-3" style={{ color: C.inkSoft }}>{elapsed >= goal ? `🎉 ${t("Meta atingida")}` : `${t("Meta")}: ${fasting.targetH} h`}</div>
            <Btn kind="ghost" onClick={endFast}>{t("Terminar jejum")}</Btn>
          </div>
        ) : (
          <div>
            <div className="flex gap-1.5 flex-wrap mb-3">{FAST_PROTOS.map((h) => <button key={h} onClick={() => setTarget(h)} className="px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: target === h ? C.primary : C.surfaceSunk, color: target === h ? "#fff" : C.inkSoft }}>{h}:{24 - h}</button>)}</div>
            <Btn onClick={() => upd((h) => ({ ...h, fasting: { startAt: nowISO(), targetH: target } }))}>{t("Iniciar jejum")}</Btn>
          </div>
        )}
        {fastLog.length > 0 && <div className="mt-3 pt-3 space-y-1" style={{ borderTop: `1px solid ${C.border}` }}>{[...fastLog].reverse().slice(0, 4).map((f) => { const hrs = Math.round(((new Date(f.end) - new Date(f.start)) / 3600000) * 10) / 10; return <div key={f.id} className="flex justify-between text-xs" style={{ color: C.inkSoft }}><span>{fmtDay(f.start)}</span><span>{hrs} h {hrs >= f.targetH ? "✔" : ""}</span></div>; })}</div>}
      </Card>
      <Card>
        <div className="font-bold text-sm mb-3" style={{ color: C.ink }}>{t("Alimentação de hoje")}</div>
        <div className="grid grid-cols-2 gap-2">
          {[["equilibrada", "🥗 Equilibrada"], ["fraca", "🍔 Pouco equilibrada"]].map(([k, l]) => <button key={k} onClick={() => setTag(k)} className="py-2.5 rounded-xl text-sm font-semibold" style={{ background: todayTag?.tag === k ? C.primarySoft : C.surfaceSunk, color: todayTag?.tag === k ? C.primary : C.inkSoft, border: `1px solid ${todayTag?.tag === k ? C.primary : "transparent"}` }}>{t(l)}</button>)}
        </div>
        <div className="flex gap-1.5 mt-3">{last7.map((x) => <div key={x.d} className="flex-1 h-7 rounded-lg" title={x.d} style={{ background: x.tag === "equilibrada" ? C.primary : x.tag === "fraca" ? C.q3 : C.surfaceSunk }} />)}</div>
        <button className="mt-3 text-xs font-semibold" style={{ color: C.primary }} onClick={() => setAdv(!adv)}>{adv ? "− " : "+ "}{t("Calorias e macronutrientes")}</button>
        {adv && (
          <div className="mt-2">
            <div className="grid grid-cols-4 gap-2">
              {[["kcal", kcal, setKcal, "kcal"], ["P", prot, setProt, "g"], ["HC", carb, setCarb, "g"], ["G", fat, setFat, "g"]].map(([l, v, s, u]) => <label key={l} className="block text-[11px]" style={{ color: C.inkSoft }}>{l} ({u})<input type="number" min={0} className={inputCls} style={inputSt} value={v} onChange={(e) => s(e.target.value)} /></label>)}
            </div>
            <div className="mt-2"><Btn disabled={!(Number(kcal) > 0)} onClick={() => { upd((h) => ({ ...h, meals: [...arr(h, "meals"), { id: uidW(), date: day, kcal: Number(kcal), protein: Number(prot) || 0, carb: Number(carb) || 0, fat: Number(fat) || 0 }] })); setKcal(""); setProt(""); setCarb(""); setFat(""); }}>{t("Adicionar refeição")}</Btn></div>
            {kcalToday > 0 && <div className="text-xs mt-2" style={{ color: C.inkSoft }}>{t("Hoje")}: {kcalToday} kcal · P {macro.p} g · HC {macro.c} g · G {macro.f} g</div>}
          </div>
        )}
      </Card>
    </Page>
  );
}

/* ------------------------------ roteador ------------------------------ */
export function WellnessSub({ id, health, setHealth, onBack, tasks, onCreateTask, onDeleteTasks, onSyncTasks, onOpenAttachment, addExpense, generateMealPlan }) {
  const hx = normalizeHx(health);
  const upd = (fn) => setHealth((h) => fn(normalizeHx(h)));
  const p = { hx, upd, onBack, tasks, onCreateTask, onDeleteTasks, onSyncTasks, onOpenAttachment, addExpense, generateMealPlan };
  switch (id) {
    case "meds": return <Meds {...p} />;
    case "appts": return <Appts {...p} />;
    case "vitals": return <Vitals {...p} />;
    case "sleep": return <Sleep {...p} />;
    case "mood": return <Mood {...p} />;
    case "breath": return <Breath {...p} />;
    case "workouts": return <Workouts {...p} />;
    case "meals": return <Meals {...p} />;
    default: return null;
  }
}
