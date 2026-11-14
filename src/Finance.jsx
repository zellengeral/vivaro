import React, { useState, useMemo, useEffect } from "react";
import { Plus, X, Trash2, Wallet, CreditCard, PiggyBank, ArrowLeftRight, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Target, Pencil, Landmark } from "lucide-react";
import { t, locale } from "./i18n.js";
import * as F from "./financeLogic.js";

// Mesmas variáveis CSS de tema usadas em App.jsx
const C = new Proxy({}, { get: (_, k) => `var(--v-${String(k)})` });
const inputCls = "w-full px-3 py-2 rounded-lg border text-sm outline-none";
const inputSt = { background: "var(--v-surfaceSunk)", borderColor: "var(--v-border)", color: "var(--v-ink)" };

function Sheet({ title, onClose, children, footer }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" style={{ background: "rgba(28,31,36,0.5)" }}>
      <div className="w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl" style={{ background: C.surface }}>
        <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10" style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <h2 className="font-bold text-lg" style={{ color: C.ink }}>{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg" style={{ color: C.inkSoft }}><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">{children}</div>
        {footer && <div className="px-5 pb-5 pt-1 flex gap-2">{footer}</div>}
      </div>
    </div>
  );
}
const Field = ({ label, children }) => (
  <label className="block"><span className="block text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>{label}</span>{children}</label>
);
const Btn = ({ children, onClick, kind = "primary", disabled, className = "" }) => (
  <button onClick={onClick} disabled={disabled} className={`px-4 py-2.5 rounded-xl font-semibold text-sm disabled:opacity-40 ${className}`}
    style={kind === "primary" ? { background: C.primary, color: "#fff" } : kind === "danger" ? { background: C.dangerSoft, color: C.danger } : { border: `1px solid ${C.border}`, color: C.ink }}>{children}</button>
);
const Card = ({ children, className = "", style }) => (
  <div className={`rounded-2xl p-4 ${className}`} style={{ background: C.surface, border: `1px solid ${C.border}`, ...style }}>{children}</div>
);
const Bar = ({ pct, color }) => (
  <div className="h-2 rounded-full overflow-hidden" style={{ background: C.surfaceSunk }}>
    <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct * 100))}%`, background: color }} />
  </div>
);

const ACCOUNT_TYPES = [["corrente", "Conta corrente"], ["poupanca", "Poupança"], ["carteira", "Carteira"]];
const accTypeLabel = (k) => t(ACCOUNT_TYPES.find((a) => a[0] === k)?.[1] || "Conta corrente");

export default function FinanceView({ fin, setFin, onCreateTask }) {
  const [tab, setTab] = useState("resumo");
  const [month, setMonth] = useState(F.monthOf(F.todayISO()));
  const [modal, setModal] = useState(null); // {kind, data}
  const money = (c) => F.fmtMoney(c, fin.currency, locale());
  const today = F.todayISO();

  // Mantém as recorrências geradas para os próximos 13 meses
  useEffect(() => {
    if (!fin.recurrences.length) return;
    const next = F.materializeRecurrences(fin, F.addMonthsISO(today, 13));
    if (next !== fin) setFin(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fin.recurrences.length]);

  const balances = useMemo(() => F.accountBalances(fin), [fin]);
  const forecastEnd = useMemo(() => F.accountBalances(fin, { upTo: F.endOfMonthISO(month) }), [fin, month]);
  const consolidated = F.sumValues(balances);
  const forecast = F.sumValues(forecastEnd);
  const result = useMemo(() => F.monthResult(fin, month), [fin, month]);
  const invoices = useMemo(() => F.computeInvoices(fin), [fin]);
  const catName = (id) => fin.categories.find((c) => c.id === id)?.name || t("Sem categoria");
  const accName = (id) => fin.accounts.find((a) => a.id === id)?.name || "—";
  const cardName = (id) => fin.cards.find((c) => c.id === id)?.name || "—";
  const monthLabel = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString(locale(), { month: "long", year: "numeric" }); };

  const tabs = [["resumo", "Resumo"], ["transacoes", "Transações"], ["contas", "Contas"], ["orcamento", "Orçamento"], ["metas", "Metas"]];

  const MonthNav = () => (
    <div className="flex items-center justify-between mb-3">
      <button onClick={() => setMonth(F.addMonthKey(month, -1))} className="p-2 rounded-lg" style={{ color: C.inkSoft }}><ChevronLeft size={18} /></button>
      <div className="font-semibold capitalize" style={{ color: C.ink }}>{monthLabel(month)}</div>
      <button onClick={() => setMonth(F.addMonthKey(month, 1))} className="p-2 rounded-lg" style={{ color: C.inkSoft }}><ChevronRight size={18} /></button>
    </div>
  );

  /* ------------------------------ RESUMO ------------------------------ */
  const proj = useMemo(() => F.projection(fin, 6), [fin]);
  const maxAbs = Math.max(1, ...proj.map((p) => Math.abs(p.endBalance)));
  const Resumo = () => (
    <div className="space-y-4">
      <MonthNav />
      <div className="grid grid-cols-2 gap-3">
        <Card><div className="text-xs font-semibold" style={{ color: C.inkSoft }}>{t("Saldo atual (efetivado)")}</div><div className="text-xl font-bold mt-1" style={{ color: consolidated < 0 ? C.danger : C.ink }}>{money(consolidated)}</div></Card>
        <Card><div className="text-xs font-semibold" style={{ color: C.inkSoft }}>{t("Saldo previsto (fim do mês)")}</div><div className="text-xl font-bold mt-1" style={{ color: forecast < 0 ? C.danger : C.ink }}>{money(forecast)}</div></Card>
        <Card><div className="flex items-center gap-1 text-xs font-semibold" style={{ color: C.inkSoft }}><TrendingUp size={14} color={C.primary} />{t("Receitas do mês")}</div><div className="text-lg font-bold mt-1" style={{ color: C.primary }}>{money(result.incomeDone)}</div>
          {result.incomeAll > result.incomeDone && <div className="text-xs" style={{ color: C.inkSoft }}>{t("previsto")}: {money(result.incomeAll)}</div>}</Card>
        <Card><div className="flex items-center gap-1 text-xs font-semibold" style={{ color: C.inkSoft }}><TrendingDown size={14} color={C.accent} />{t("Despesas do mês")}</div><div className="text-lg font-bold mt-1" style={{ color: C.accent }}>{money(result.expenseDone)}</div>
          {result.expenseAll > result.expenseDone && <div className="text-xs" style={{ color: C.inkSoft }}>{t("previsto")}: {money(result.expenseAll)}</div>}</Card>
      </div>
      <Card>
        <div className="font-bold mb-3" style={{ color: C.ink }}>{t("Fluxo de caixa futuro")}</div>
        <div className="space-y-2">
          {proj.map((p) => (
            <div key={p.month}>
              <div className="flex justify-between text-xs mb-1" style={{ color: C.inkSoft }}><span className="capitalize">{monthLabel(p.month)}</span><span style={{ color: p.endBalance < 0 ? C.danger : C.ink, fontWeight: 600 }}>{money(p.endBalance)}</span></div>
              <Bar pct={Math.abs(p.endBalance) / maxAbs} color={p.endBalance < 0 ? C.danger : C.primary} />
              <div className="flex justify-between text-[11px] mt-0.5" style={{ color: C.inkSoft }}><span>+ {money(p.income)}</span><span>− {money(p.expense)}</span></div>
            </div>
          ))}
        </div>
      </Card>
      {invoices.filter((i) => i.remainingCents > 0).length > 0 && (
        <Card>
          <div className="font-bold mb-2" style={{ color: C.ink }}>{t("Faturas por pagar")}</div>
          {invoices.filter((i) => i.remainingCents > 0).slice(0, 6).map((i) => (
            <div key={i.key} className="flex items-center justify-between py-1.5 text-sm">
              <div><div style={{ color: C.ink }}>{cardName(i.cardId)} · <span className="capitalize">{monthLabel(i.month)}</span></div><div className="text-xs" style={{ color: i.dueDate < today ? C.danger : C.inkSoft }}>{t("Vence")} {i.dueDate}</div></div>
              <button onClick={() => setModal({ kind: "pay", data: i })} className="font-semibold" style={{ color: C.primary }}>{money(i.remainingCents)} · {t("Pagar")}</button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );

  /* ------------------------------ TRANSAÇÕES ------------------------------ */
  const monthTx = fin.transactions.filter((x) => (x.type === "expense" && x.cardId ? F.monthOf(x.date) : F.monthOf(x.date)) === month).sort((a, b) => (a.date < b.date ? 1 : -1));
  const txLabel = (x) => x.description || (x.type === "transfer" ? t("Transferência") : x.type === "card_payment" ? t("Pagamento de fatura") : catName(x.categoryId));
  const Transacoes = () => (
    <div>
      <MonthNav />
      {monthTx.length === 0 && <Card><div className="text-sm text-center" style={{ color: C.inkSoft }}>{t("Sem transações neste mês.")}</div></Card>}
      <div className="space-y-2">
        {monthTx.map((x) => {
          const sign = x.type === "income" ? 1 : x.type === "transfer" ? 0 : -1;
          const color = x.type === "income" ? C.primary : x.type === "transfer" ? C.inkSoft : C.accent;
          return (
            <Card key={x.id} className="!p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate" style={{ color: C.ink }}>{txLabel(x)}{x.installmentTotal ? ` (${x.installmentNo}/${x.installmentTotal})` : ""}</div>
                <div className="text-xs truncate" style={{ color: C.inkSoft }}>
                  {x.date} · {x.type === "transfer" ? `${accName(x.accountId)} → ${accName(x.toAccountId)}` : x.cardId ? cardName(x.cardId) : accName(x.accountId)}
                  {x.status === "planned" ? ` · ${t("Previsto")}` : ""}
                </div>
              </div>
              <div className="text-sm font-bold" style={{ color, opacity: x.status === "planned" ? 0.65 : 1 }}>{sign < 0 ? "−" : sign > 0 ? "+" : ""}{money(x.amountCents)}</div>
              {x.status === "planned" && x.type !== "card_payment" && (
                <button title={t("Efetivar")} onClick={() => setFin((f) => ({ ...f, transactions: f.transactions.map((y) => (y.id === x.id ? { ...y, status: "done" } : y)) }))} className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ background: C.primarySoft, color: C.primary }}>{t("Efetivar")}</button>
              )}
              <button onClick={() => setModal({ kind: "delTx", data: x })} className="p-1" style={{ color: C.inkSoft }}><Trash2 size={16} /></button>
            </Card>
          );
        })}
      </div>
    </div>
  );

  /* ------------------------------ CONTAS ------------------------------ */
  const Contas = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h3 className="font-bold" style={{ color: C.ink }}>{t("Contas")}</h3><Btn kind="ghost" onClick={() => setModal({ kind: "account", data: null })}><Plus size={14} className="inline mr-1" />{t("Conta")}</Btn></div>
      {fin.accounts.length === 0 && <Card><div className="text-sm" style={{ color: C.inkSoft }}>{t("Crie a primeira conta (corrente, poupança ou carteira) para começar.")}</div></Card>}
      {fin.accounts.map((a) => (
        <Card key={a.id} className="flex items-center gap-3">
          <div className="p-2 rounded-xl" style={{ background: C.primarySoft, color: C.primary }}>{a.type === "poupanca" ? <PiggyBank size={20} /> : a.type === "carteira" ? <Wallet size={20} /> : <Landmark size={20} />}</div>
          <div className="flex-1 min-w-0"><div className="font-semibold truncate" style={{ color: C.ink }}>{a.name}</div><div className="text-xs" style={{ color: C.inkSoft }}>{accTypeLabel(a.type)}</div></div>
          <div className="font-bold" style={{ color: (balances[a.id] || 0) < 0 ? C.danger : C.ink }}>{money(balances[a.id] || 0)}</div>
          <button onClick={() => setModal({ kind: "account", data: a })} className="p-1" style={{ color: C.inkSoft }}><Pencil size={16} /></button>
        </Card>
      ))}
      <div className="flex items-center justify-between pt-2"><h3 className="font-bold" style={{ color: C.ink }}>{t("Cartões de crédito")}</h3><Btn kind="ghost" onClick={() => setModal({ kind: "card", data: null })}><Plus size={14} className="inline mr-1" />{t("Cartão")}</Btn></div>
      {fin.cards.map((c) => {
        const used = F.cardUsed(fin, c.id);
        return (
          <Card key={c.id}>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl" style={{ background: C.accentSoft, color: C.accent }}><CreditCard size={20} /></div>
              <div className="flex-1 min-w-0"><div className="font-semibold truncate" style={{ color: C.ink }}>{c.name}</div><div className="text-xs" style={{ color: C.inkSoft }}>{t("Fecha dia")} {c.closingDay} · {t("vence dia")} {c.dueDay}</div></div>
              <button onClick={() => setModal({ kind: "card", data: c })} className="p-1" style={{ color: C.inkSoft }}><Pencil size={16} /></button>
            </div>
            <div className="mt-3"><Bar pct={c.limitCents ? used / c.limitCents : 0} color={used > c.limitCents ? C.danger : C.accent} />
              <div className="flex justify-between text-xs mt-1" style={{ color: C.inkSoft }}><span>{t("Usado")}: {money(used)}</span><span>{t("Disponível")}: {money(Math.max(0, c.limitCents - used))}</span></div></div>
          </Card>
        );
      })}
      <Card>
        <Field label={t("Moeda")}>
          <select className={inputCls} style={inputSt} value={fin.currency} onChange={(e) => setFin((f) => ({ ...f, currency: e.target.value }))}>
            {["EUR", "BRL", "USD", "GBP", "CHF", "JPY", "SEK", "PLN", "CNY", "RUB"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </Card>
    </div>
  );

  /* ------------------------------ ORÇAMENTO ------------------------------ */
  const bst = useMemo(() => F.budgetStatus(fin, month), [fin, month]);
  const Orcamento = () => (
    <div className="space-y-3">
      <MonthNav />
      <div className="flex justify-end"><Btn kind="ghost" onClick={() => setModal({ kind: "budget", data: null })}><Plus size={14} className="inline mr-1" />{t("Teto de gastos")}</Btn></div>
      {bst.length === 0 && <Card><div className="text-sm" style={{ color: C.inkSoft }}>{t("Defina um teto mensal por categoria.")}</div></Card>}
      {bst.map((b) => (
        <Card key={b.id}>
          <div className="flex items-center justify-between mb-2">
            <div className="font-semibold" style={{ color: C.ink }}>{catName(b.categoryId)}</div>
            <button onClick={() => setFin((f) => ({ ...f, budgets: f.budgets.filter((x) => x.id !== b.id) }))} style={{ color: C.inkSoft }}><Trash2 size={15} /></button>
          </div>
          <Bar pct={b.pct} color={b.pct >= 1 ? C.danger : b.pct >= 0.8 ? C.q3 : C.primary} />
          <div className="flex justify-between text-xs mt-1" style={{ color: b.pct >= 1 ? C.danger : C.inkSoft }}><span>{money(b.spentCents)} / {money(b.limitCents)}</span><span>{Math.round(b.pct * 100)}%</span></div>
        </Card>
      ))}
    </div>
  );

  /* ------------------------------ METAS ------------------------------ */
  const Metas = () => (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><h3 className="font-bold" style={{ color: C.ink }}>{t("Metas (cofrinhos)")}</h3><Btn kind="ghost" onClick={() => setModal({ kind: "goal", data: null })}><Plus size={14} className="inline mr-1" />{t("Meta")}</Btn></div>
      {fin.goals.length === 0 && <Card><div className="text-sm" style={{ color: C.inkSoft }}>{t("Crie um cofrinho: viagem, fundo de emergência…")}</div></Card>}
      {fin.goals.map((g) => {
        const saved = F.goalSaved(fin, g.id);
        return (
          <Card key={g.id}>
            <div className="flex items-center gap-2 mb-2"><Target size={18} color={C.primary} /><div className="flex-1 font-semibold truncate" style={{ color: C.ink }}>{g.name}</div>
              <button onClick={() => setFin((f) => ({ ...f, goals: f.goals.filter((x) => x.id !== g.id), goalDeposits: f.goalDeposits.filter((d) => d.goalId !== g.id) }))} style={{ color: C.inkSoft }}><Trash2 size={15} /></button></div>
            <Bar pct={g.targetCents ? saved / g.targetCents : 0} color={C.primary} />
            <div className="flex justify-between text-xs mt-1" style={{ color: C.inkSoft }}><span>{money(saved)} / {money(g.targetCents)}</span><span>{g.deadline || ""}</span></div>
            <div className="mt-3"><Btn kind="ghost" onClick={() => setModal({ kind: "deposit", data: g })}>{t("Depositar / retirar")}</Btn></div>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{t("Finanças")}</h2>
        <Btn onClick={() => (fin.accounts.length ? setModal({ kind: "tx", data: null }) : setModal({ kind: "account", data: null }))}><Plus size={14} className="inline mr-1" />{t("Transação")}</Btn>
      </div>
      <div className="flex gap-1 overflow-x-auto mb-4 rounded-xl p-1" style={{ background: C.surfaceSunk, scrollbarWidth: "none" }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className="flex-shrink-0 px-3.5 py-2 rounded-lg text-sm font-semibold"
            style={{ background: tab === id ? C.surface : "transparent", color: tab === id ? C.primary : C.inkSoft }}>{t(label)}</button>
        ))}
      </div>
      {tab === "resumo" && Resumo()}
      {tab === "transacoes" && Transacoes()}
      {tab === "contas" && Contas()}
      {tab === "orcamento" && Orcamento()}
      {tab === "metas" && Metas()}

      {modal?.kind === "tx" && <TxModal fin={fin} setFin={setFin} onClose={() => setModal(null)} onCreateTask={onCreateTask} />}
      {modal?.kind === "account" && <AccountModal fin={fin} setFin={setFin} data={modal.data} onClose={() => setModal(null)} />}
      {modal?.kind === "card" && <CardModal fin={fin} setFin={setFin} data={modal.data} onClose={() => setModal(null)} />}
      {modal?.kind === "budget" && <BudgetModal fin={fin} setFin={setFin} onClose={() => setModal(null)} />}
      {modal?.kind === "goal" && <GoalModal setFin={setFin} onClose={() => setModal(null)} />}
      {modal?.kind === "deposit" && <DepositModal fin={fin} setFin={setFin} goal={modal.data} onClose={() => setModal(null)} />}
      {modal?.kind === "pay" && <PayModal fin={fin} setFin={setFin} inv={modal.data} onClose={() => setModal(null)} />}
      {modal?.kind === "delTx" && (
        <Sheet title={t("Apagar transação")} onClose={() => setModal(null)}
          footer={<><Btn kind="ghost" onClick={() => setModal(null)}>{t("Cancelar")}</Btn>
            <Btn kind="danger" onClick={() => { const x = modal.data; setFin((f) => ({ ...f, transactions: f.transactions.filter((y) => y.id !== x.id) })); setModal(null); }}>{t("Apagar")}</Btn>
            {(modal.data.installmentGroupId || modal.data.recurrenceId) && <Btn kind="danger" onClick={() => { const x = modal.data; setFin((f) => ({ ...f, transactions: f.transactions.filter((y) => !(x.installmentGroupId ? y.installmentGroupId === x.installmentGroupId : y.recurrenceId === x.recurrenceId && y.date >= x.date)), recurrences: x.recurrenceId ? f.recurrences.filter((r) => r.id !== x.recurrenceId) : f.recurrences })); setModal(null); }}>{x_label(modal.data)}</Btn>}
          </>}>
          <div className="text-sm" style={{ color: C.inkSoft }}>{txLabel(modal.data)} · {money(modal.data.amountCents)}</div>
        </Sheet>
      )}
    </div>
  );
}
const x_label = (x) => (x.installmentGroupId ? t("Apagar todas as parcelas") : t("Apagar esta e as seguintes"));

/* ------------------------------ modais ------------------------------ */
function TxModal({ fin, setFin, onClose, onCreateTask }) {
  const [type, setType] = useState("expense");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(F.todayISO());
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("");
  const [src, setSrc] = useState(fin.accounts[0] ? `a:${fin.accounts[0].id}` : "");
  const [dest, setDest] = useState(fin.accounts[1]?.id || "");
  const [inst, setInst] = useState(1);
  const [rec, setRec] = useState("");
  const [planned, setPlanned] = useState(false);
  const [mkTask, setMkTask] = useState(false);
  const cents = F.toCents(amount);
  const cats = fin.categories.filter((c) => c.kind === (type === "income" ? "income" : "expense"));
  const parents = cats.filter((c) => !c.parentId);
  const isCard = src.startsWith("c:");
  const valid = cents > 0 && src && (type !== "transfer" || (dest && dest !== src.slice(2)));

  const save = () => {
    const spec = { type, amountCents: cents, date, description: desc.trim(), categoryId: type === "transfer" ? null : cat || null,
      accountId: isCard ? null : src.slice(2), cardId: isCard ? src.slice(2) : null, toAccountId: type === "transfer" ? dest : null,
      status: planned || date > F.todayISO() ? "planned" : "done", installments: type === "expense" ? inst : 1,
      recurrence: rec ? { freq: rec } : null };
    let taskId = null;
    if (spec.status === "planned" && mkTask && onCreateTask) {
      taskId = F.uidF();
      onCreateTask({ id: taskId, title: `${type === "income" ? t("Receber") : t("Pagar")}: ${spec.description || cat && fin.categories.find((c) => c.id === cat)?.name || F.fmtMoney(cents, fin.currency)}`,
        description: F.fmtMoney(cents, fin.currency), category: "pessoal", quadrant: 1, status: "pendente",
        dueAt: new Date(`${date}T09:00:00`).toISOString(), reminders: [{ id: F.uidF(), value: 1, unit: "days" }], attachments: [], subtasks: [], assignee: "", watchers: [], comments: [],
        recurrence: null, alarmMode: false, clockAlarm: false, completedAt: null, createdAt: new Date().toISOString() });
      spec.taskId = taskId;
    }
    setFin((f) => F.materializeRecurrences(F.addTransaction(f, spec), F.addMonthsISO(F.todayISO(), 13)));
    onClose();
  };

  return (
    <Sheet title={t("Nova transação")} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn><Btn disabled={!valid} onClick={save}>{t("Guardar")}</Btn></>}>
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl" style={{ background: C.surfaceSunk }}>
        {[["expense", "Despesa"], ["income", "Receita"], ["transfer", "Transferência"]].map(([id, l]) => (
          <button key={id} onClick={() => { setType(id); setCat(""); if (id !== "expense") { setInst(1); } if (id !== "expense" && isCard) setSrc(fin.accounts[0] ? `a:${fin.accounts[0].id}` : ""); }}
            className="py-2 rounded-lg text-sm font-semibold" style={{ background: type === id ? C.surface : "transparent", color: type === id ? C.primary : C.inkSoft }}>{t(l)}</button>
        ))}
      </div>
      <Field label={t("Valor")}><input className={inputCls} style={inputSt} inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label={t("Descrição")}><input className={inputCls} style={inputSt} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Data")}><input type="date" className={inputCls} style={inputSt} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        {type !== "transfer" && (
          <Field label={t("Categoria")}>
            <select className={inputCls} style={inputSt} value={cat} onChange={(e) => setCat(e.target.value)}>
              <option value="">—</option>
              {parents.map((p) => (<React.Fragment key={p.id}><option value={p.id}>{p.name}</option>{cats.filter((c) => c.parentId === p.id).map((c) => <option key={c.id} value={c.id}>— {c.name}</option>)}</React.Fragment>))}
            </select>
          </Field>
        )}
      </div>
      <Field label={type === "transfer" ? t("Conta de origem") : type === "income" ? t("Conta") : t("Conta ou cartão")}>
        <select className={inputCls} style={inputSt} value={src} onChange={(e) => setSrc(e.target.value)}>
          {fin.accounts.map((a) => <option key={a.id} value={`a:${a.id}`}>{a.name}</option>)}
          {type === "expense" && fin.cards.map((c) => <option key={c.id} value={`c:${c.id}`}>💳 {c.name}</option>)}
        </select>
      </Field>
      {type === "transfer" && (
        <Field label={t("Conta de destino")}>
          <select className={inputCls} style={inputSt} value={dest} onChange={(e) => setDest(e.target.value)}>
            <option value="">—</option>{fin.accounts.filter((a) => `a:${a.id}` !== src).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
      )}
      {type === "expense" && (
        <Field label={t("Parcelas")}><input type="number" min={1} max={60} className={inputCls} style={inputSt} value={inst} onChange={(e) => setInst(Math.max(1, Math.min(60, Number(e.target.value) || 1)))} />
          {inst > 1 && cents > 0 && <span className="text-xs" style={{ color: C.inkSoft }}>{inst}× ≈ {F.fmtMoney(Math.ceil(cents / inst), fin.currency, locale())}</span>}</Field>
      )}
      <Field label={t("Repetir")}>
        <select className={inputCls} style={inputSt} value={rec} onChange={(e) => setRec(e.target.value)}>
          <option value="">{t("Não repetir")}</option><option value="monthly">{t("Todos os meses")}</option><option value="weekly">{t("Todas as semanas")}</option><option value="yearly">{t("Todos os anos")}</option>
        </select>
      </Field>
      <label className="flex items-center gap-2 text-sm" style={{ color: C.ink }}><input type="checkbox" checked={planned || date > F.todayISO()} disabled={date > F.todayISO()} onChange={(e) => setPlanned(e.target.checked)} />{t("Ainda não efetivada (previsto)")}</label>
      {(planned || date > F.todayISO()) && <label className="flex items-center gap-2 text-sm" style={{ color: C.ink }}><input type="checkbox" checked={mkTask} onChange={(e) => setMkTask(e.target.checked)} />{t("Criar tarefa com lembrete")}</label>}
    </Sheet>
  );
}

function AccountModal({ fin, setFin, data, onClose }) {
  const [name, setName] = useState(data?.name || "");
  const [type, setType] = useState(data?.type || "corrente");
  const [opening, setOpening] = useState(data ? String((data.openingCents || 0) / 100) : "");
  const save = () => {
    const acc = { id: data?.id || F.uidF(), name: name.trim(), type, openingCents: F.toCents(opening) };
    setFin((f) => ({ ...f, accounts: data ? f.accounts.map((a) => (a.id === data.id ? acc : a)) : [...f.accounts, acc] }));
    onClose();
  };
  const del = () => {
    if (fin.transactions.some((x) => x.accountId === data.id || x.toAccountId === data.id)) { alert(t("Esta conta tem transações e não pode ser apagada.")); return; }
    setFin((f) => ({ ...f, accounts: f.accounts.filter((a) => a.id !== data.id) })); onClose();
  };
  return (
    <Sheet title={data ? t("Editar conta") : t("Nova conta")} onClose={onClose}
      footer={<>{data && <Btn kind="danger" onClick={del}>{t("Apagar")}</Btn>}<Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn><Btn disabled={!name.trim()} onClick={save}>{t("Guardar")}</Btn></>}>
      <Field label={t("Nome")}><input className={inputCls} style={inputSt} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t("Tipo")}><select className={inputCls} style={inputSt} value={type} onChange={(e) => setType(e.target.value)}>{ACCOUNT_TYPES.map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}</select></Field>
      <Field label={t("Saldo inicial")}><input className={inputCls} style={inputSt} inputMode="decimal" placeholder="0,00" value={opening} onChange={(e) => setOpening(e.target.value)} /></Field>
    </Sheet>
  );
}

function CardModal({ fin, setFin, data, onClose }) {
  const [name, setName] = useState(data?.name || "");
  const [limit, setLimit] = useState(data ? String(data.limitCents / 100) : "");
  const [closing, setClosing] = useState(data?.closingDay || 10);
  const [due, setDue] = useState(data?.dueDay || 20);
  const [pay, setPay] = useState(data?.payAccountId || fin.accounts[0]?.id || "");
  const save = () => {
    const c = { id: data?.id || F.uidF(), name: name.trim(), limitCents: F.toCents(limit), closingDay: Math.min(31, Math.max(1, +closing || 1)), dueDay: Math.min(31, Math.max(1, +due || 1)), payAccountId: pay || null };
    setFin((f) => ({ ...f, cards: data ? f.cards.map((x) => (x.id === data.id ? c : x)) : [...f.cards, c] }));
    onClose();
  };
  const del = () => {
    if (fin.transactions.some((x) => x.cardId === data.id)) { alert(t("Este cartão tem transações e não pode ser apagado.")); return; }
    setFin((f) => ({ ...f, cards: f.cards.filter((x) => x.id !== data.id) })); onClose();
  };
  return (
    <Sheet title={data ? t("Editar cartão") : t("Novo cartão")} onClose={onClose}
      footer={<>{data && <Btn kind="danger" onClick={del}>{t("Apagar")}</Btn>}<Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn><Btn disabled={!name.trim()} onClick={save}>{t("Guardar")}</Btn></>}>
      <Field label={t("Nome")}><input className={inputCls} style={inputSt} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t("Limite")}><input className={inputCls} style={inputSt} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Dia de fecho")}><input type="number" min={1} max={31} className={inputCls} style={inputSt} value={closing} onChange={(e) => setClosing(e.target.value)} /></Field>
        <Field label={t("Dia de vencimento")}><input type="number" min={1} max={31} className={inputCls} style={inputSt} value={due} onChange={(e) => setDue(e.target.value)} /></Field>
      </div>
      <Field label={t("Conta que paga a fatura")}><select className={inputCls} style={inputSt} value={pay} onChange={(e) => setPay(e.target.value)}><option value="">—</option>{fin.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
    </Sheet>
  );
}

function BudgetModal({ fin, setFin, onClose }) {
  const [cat, setCat] = useState("");
  const [limit, setLimit] = useState("");
  const parents = fin.categories.filter((c) => c.kind === "expense" && !c.parentId);
  const save = () => {
    setFin((f) => ({ ...f, budgets: [...f.budgets.filter((b) => b.categoryId !== cat), { id: F.uidF(), categoryId: cat, limitCents: F.toCents(limit) }] }));
    onClose();
  };
  return (
    <Sheet title={t("Teto de gastos")} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn><Btn disabled={!cat || F.toCents(limit) <= 0} onClick={save}>{t("Guardar")}</Btn></>}>
      <Field label={t("Categoria")}><select className={inputCls} style={inputSt} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">—</option>
        {parents.map((p) => (<React.Fragment key={p.id}><option value={p.id}>{p.name}</option>{fin.categories.filter((c) => c.parentId === p.id).map((c) => <option key={c.id} value={c.id}>— {c.name}</option>)}</React.Fragment>))}</select></Field>
      <Field label={t("Limite mensal")}><input className={inputCls} style={inputSt} inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} /></Field>
    </Sheet>
  );
}

function GoalModal({ setFin, onClose }) {
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  return (
    <Sheet title={t("Nova meta")} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn>
      <Btn disabled={!name.trim() || F.toCents(target) <= 0} onClick={() => { setFin((f) => ({ ...f, goals: [...f.goals, { id: F.uidF(), name: name.trim(), targetCents: F.toCents(target), deadline: deadline || null }] })); onClose(); }}>{t("Guardar")}</Btn></>}>
      <Field label={t("Nome")}><input className={inputCls} style={inputSt} value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label={t("Valor da meta")}><input className={inputCls} style={inputSt} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /></Field>
      <Field label={t("Prazo (opcional)")}><input type="date" className={inputCls} style={inputSt} value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
    </Sheet>
  );
}

function DepositModal({ fin, setFin, goal, onClose }) {
  const [amount, setAmount] = useState("");
  const [withdraw, setWithdraw] = useState(false);
  const [acc, setAcc] = useState("");
  const cents = F.toCents(amount);
  const save = () => {
    const signed = withdraw ? -cents : cents;
    setFin((f) => {
      let next = { ...f, goalDeposits: [...f.goalDeposits, { id: F.uidF(), goalId: goal.id, date: F.todayISO(), amountCents: signed }] };
      // opcional: o depósito sai/volta à conta escolhida como uma despesa/receita "Cofrinho"
      if (acc) next = F.addTransaction(next, { type: withdraw ? "income" : "expense", amountCents: cents, date: F.todayISO(), accountId: acc, description: `${t("Cofrinho")}: ${goal.name}`, categoryId: null });
      return next;
    });
    onClose();
  };
  return (
    <Sheet title={goal.name} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn><Btn disabled={cents <= 0} onClick={save}>{t("Guardar")}</Btn></>}>
      <div className="grid grid-cols-2 gap-1 p-1 rounded-xl" style={{ background: C.surfaceSunk }}>
        {[[false, "Depositar"], [true, "Retirar"]].map(([w, l]) => <button key={l} onClick={() => setWithdraw(w)} className="py-2 rounded-lg text-sm font-semibold" style={{ background: withdraw === w ? C.surface : "transparent", color: withdraw === w ? C.primary : C.inkSoft }}>{t(l)}</button>)}
      </div>
      <Field label={t("Valor")}><input className={inputCls} style={inputSt} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label={t("Movimentar também uma conta (opcional)")}><select className={inputCls} style={inputSt} value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">{t("Não")}</option>{fin.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
    </Sheet>
  );
}

function PayModal({ fin, setFin, inv, onClose }) {
  const card = fin.cards.find((c) => c.id === inv.cardId);
  const [acc, setAcc] = useState(card?.payAccountId || fin.accounts[0]?.id || "");
  const [date, setDate] = useState(F.todayISO());
  const [amount, setAmount] = useState(String(inv.remainingCents / 100));
  const cents = Math.min(F.toCents(amount), inv.remainingCents);
  return (
    <Sheet title={t("Pagar fatura")} onClose={onClose} footer={<><Btn kind="ghost" onClick={onClose}>{t("Cancelar")}</Btn>
      <Btn disabled={!acc || cents <= 0} onClick={() => { setFin((f) => F.payInvoice(f, { cardId: inv.cardId, month: inv.month, accountId: acc, date, amountCents: cents })); onClose(); }}>{t("Pagar")}</Btn></>}>
      <div className="text-sm" style={{ color: C.inkSoft }}>{card?.name} · {inv.month}</div>
      <Field label={t("Valor")}><input className={inputCls} style={inputSt} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label={t("Pagar com a conta")}><select className={inputCls} style={inputSt} value={acc} onChange={(e) => setAcc(e.target.value)}>{fin.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label={t("Data")}><input type="date" className={inputCls} style={inputSt} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
    </Sheet>
  );
}
