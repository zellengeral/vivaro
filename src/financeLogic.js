// Lógica do módulo financeiro (funções puras, sem React). Valores monetários SEMPRE em inteiros (centavos).
// O modelo espelha o esquema SQLite descrito em FINANCAS-SQLITE.md, para uma migração futura sem surpresas.

export const FIN_KEY = "vivaro:finance:v1";

export const uidF = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* ------------------------------ dinheiro ------------------------------ */
// "12,50" | "12.50" | "1.234,56" | "1,234.56" → 1250 / 123456 (centavos)
export function toCents(input) {
  let s = String(input ?? "").replace(/[^\d,.\-]/g, "");
  if (!s) return 0;
  const neg = s.startsWith("-");
  s = s.replace(/-/g, "");
  const lastComma = s.lastIndexOf(","), lastDot = s.lastIndexOf(".");
  const decPos = Math.max(lastComma, lastDot);
  let intPart = s, frac = "";
  if (decPos >= 0) {
    const tail = s.slice(decPos + 1);
    // separador decimal se houver 1–2 dígitos depois dele (ou se for o único tipo de separador com ≠3 dígitos)
    const onlyOneSep = lastComma < 0 || lastDot < 0;
    if (tail.length <= 2 || (!onlyOneSep) || tail.length !== 3) { intPart = s.slice(0, decPos); frac = tail; }
  }
  intPart = intPart.replace(/[.,]/g, "");
  const v = Math.round(parseFloat(`${intPart || "0"}.${(frac + "00").slice(0, 2)}`) * 100 + (frac.length > 2 && Number(frac[2]) >= 5 ? 1 : 0));
  return neg ? -v : v;
}

export function fmtMoney(cents, currency = "EUR", locale = "pt-PT") {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format((cents || 0) / 100);
  } catch (e) {
    return `${((cents || 0) / 100).toFixed(2)} ${currency}`;
  }
}

/* ------------------------------ datas (ISO yyyy-mm-dd, sem fuso) ------------------------------ */
const p2 = (n) => String(n).padStart(2, "0");
export const isoOf = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
export const todayISO = () => isoOf(new Date());
export const parseISO = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
export const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m = 1..12
export const monthOf = (iso) => iso.slice(0, 7);
export function addMonthsISO(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const tot = (y * 12 + (m - 1)) + n;
  const ny = Math.floor(tot / 12), nm = (tot % 12) + 1;
  return `${ny}-${p2(nm)}-${p2(Math.min(d, daysInMonth(ny, nm)))}`;
}
export const addMonthKey = (key, n) => addMonthsISO(`${key}-01`, n).slice(0, 7);
export function addDaysISO(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoOf(d); }
export const endOfMonthISO = (key) => { const [y, m] = key.split("-").map(Number); return `${key}-${p2(daysInMonth(y, m))}`; };

/* ------------------------------ cartões: fatura ------------------------------ */
// Mês da fatura (mês em que o ciclo FECHA). Compra depois do dia de fecho entra na fatura seguinte.
export function invoiceMonth(card, dateISO) {
  const [y, m, d] = dateISO.split("-").map(Number);
  const closing = Math.min(card.closingDay || 31, daysInMonth(y, m));
  return d > closing ? addMonthKey(dateISO.slice(0, 7), 1) : dateISO.slice(0, 7);
}
// Vencimento: se o dia de vencimento é maior que o de fecho, vence no próprio mês; senão, no mês seguinte.
export function invoiceDueDate(card, invMonth) {
  const key = (card.dueDay || 1) > (card.closingDay || 1) ? invMonth : addMonthKey(invMonth, 1);
  const [y, m] = key.split("-").map(Number);
  return `${key}-${p2(Math.min(card.dueDay || 1, daysInMonth(y, m)))}`;
}

/* ------------------------------ estado inicial ------------------------------ */
const CAT = (id, name, kind, parentId = null) => ({ id, name, kind, parentId });
export const DEFAULT_CATEGORIES = [
  CAT("c-food", "Alimentação", "expense"), CAT("c-food-market", "Supermercado", "expense", "c-food"), CAT("c-food-rest", "Restaurantes", "expense", "c-food"),
  CAT("c-home", "Casa", "expense"), CAT("c-home-rent", "Renda / Prestação", "expense", "c-home"), CAT("c-home-util", "Luz, água e gás", "expense", "c-home"), CAT("c-home-net", "Internet e telefone", "expense", "c-home"),
  CAT("c-transport", "Transporte", "expense"), CAT("c-transport-fuel", "Combustível", "expense", "c-transport"), CAT("c-transport-pub", "Transportes públicos", "expense", "c-transport"),
  CAT("c-health", "Saúde", "expense"), CAT("c-leisure", "Lazer", "expense"), CAT("c-edu", "Educação", "expense"), CAT("c-shop", "Compras", "expense"), CAT("c-other-x", "Outras despesas", "expense"),
  CAT("c-salary", "Salário", "income"), CAT("c-extra", "Rendimentos extra", "income"), CAT("c-invest", "Investimentos", "income"), CAT("c-other-i", "Outras receitas", "income"),
];

export function emptyFinance() {
  return {
    currency: "EUR",
    accounts: [], cards: [], categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    transactions: [], recurrences: [], budgets: [], goals: [], goalDeposits: [],
  };
}

export function normalizeFinance(f) {
  const base = emptyFinance();
  if (!f || typeof f !== "object") return base;
  const arr = (k) => (Array.isArray(f[k]) ? f[k] : base[k]);
  return { ...base, ...f, currency: f.currency || "EUR", accounts: arr("accounts"), cards: arr("cards"), categories: Array.isArray(f.categories) && f.categories.length ? f.categories : base.categories,
    transactions: arr("transactions"), recurrences: arr("recurrences"), budgets: arr("budgets"), goals: arr("goals"), goalDeposits: arr("goalDeposits") };
}

/* ------------------------------ saldos ------------------------------ */
// Efeito de uma transação no saldo de uma conta (compras no cartão não mexem na conta: só o pagamento da fatura).
function effectOn(tx, accountId) {
  const a = tx.amountCents;
  if (tx.type === "income") return tx.accountId === accountId ? a : 0;
  if (tx.type === "expense") return tx.accountId === accountId ? -a : 0; // cardId definido ⇒ accountId nulo
  if (tx.type === "transfer") return (tx.accountId === accountId ? -a : 0) + (tx.toAccountId === accountId ? a : 0);
  if (tx.type === "card_payment") return tx.accountId === accountId ? -a : 0;
  return 0;
}

// Saldo por conta. Atual = só efetivadas. Previsto (upTo) = + planeadas até à data + faturas por pagar que vencem até à data.
export function accountBalances(fin, { upTo = null, today = todayISO() } = {}) {
  const out = {};
  fin.accounts.forEach((a) => {
    let bal = a.openingCents || 0;
    fin.transactions.forEach((tx) => {
      if (tx.status === "done") bal += effectOn(tx, a.id);
      else if (upTo && tx.date <= upTo && !(tx.type === "expense" && tx.cardId)) bal += effectOn(tx, a.id);
    });
    out[a.id] = bal;
  });
  if (upTo) {
    // faturas ainda por pagar com vencimento até upTo saem da conta pagadora do cartão
    computeInvoices(fin).forEach((inv) => {
      const card = fin.cards.find((c) => c.id === inv.cardId);
      if (!card || !card.payAccountId || !(card.payAccountId in out)) return;
      if (inv.remainingCents > 0 && inv.dueDate <= upTo) out[card.payAccountId] -= inv.remainingCents;
    });
  }
  return out;
}
export const sumValues = (o) => Object.values(o).reduce((s, v) => s + v, 0);

/* ------------------------------ faturas e limite ------------------------------ */
export function computeInvoices(fin) {
  const map = {};
  const get = (cardId, month) => {
    const k = `${cardId}|${month}`;
    if (!map[k]) {
      const card = fin.cards.find((c) => c.id === cardId);
      map[k] = { key: k, cardId, month, totalCents: 0, paidCents: 0, dueDate: card ? invoiceDueDate(card, month) : `${month}-28` };
    }
    return map[k];
  };
  fin.transactions.forEach((tx) => {
    if (!tx.cardId || !tx.invoiceMonth) return;
    if (tx.type === "expense") get(tx.cardId, tx.invoiceMonth).totalCents += tx.amountCents;
    if (tx.type === "card_payment" && tx.status === "done") get(tx.cardId, tx.invoiceMonth).paidCents += tx.amountCents;
  });
  return Object.values(map).map((i) => ({ ...i, remainingCents: Math.max(0, i.totalCents - i.paidCents) })).sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
}

// Limite usado = tudo o que foi comprado no cartão (incl. parcelas futuras) menos o que já foi pago em faturas.
export function cardUsed(fin, cardId) {
  let used = 0;
  fin.transactions.forEach((tx) => {
    if (tx.cardId !== cardId) return;
    if (tx.type === "expense") used += tx.amountCents;
    if (tx.type === "card_payment" && tx.status === "done") used -= tx.amountCents;
  });
  return Math.max(0, used);
}

/* ------------------------------ resultados, orçamentos, metas ------------------------------ */
// Resultado por competência: receitas e despesas (transferências e pagamento de fatura NÃO entram ⇒ sem dupla contagem).
export function monthResult(fin, key) {
  const r = { incomeDone: 0, expenseDone: 0, incomeAll: 0, expenseAll: 0 };
  fin.transactions.forEach((tx) => {
    if (monthOf(tx.date) !== key) return;
    if (tx.type === "income") { r.incomeAll += tx.amountCents; if (tx.status === "done") r.incomeDone += tx.amountCents; }
    if (tx.type === "expense") { r.expenseAll += tx.amountCents; if (tx.status === "done") r.expenseDone += tx.amountCents; }
  });
  return r;
}

export function categoryAndChildren(fin, categoryId) {
  return new Set([categoryId, ...fin.categories.filter((c) => c.parentId === categoryId).map((c) => c.id)]);
}

export function budgetStatus(fin, key) {
  return fin.budgets.map((b) => {
    const ids = categoryAndChildren(fin, b.categoryId);
    const spent = fin.transactions.reduce((s, tx) => (tx.type === "expense" && monthOf(tx.date) === key && ids.has(tx.categoryId) ? s + tx.amountCents : s), 0);
    return { ...b, spentCents: spent, pct: b.limitCents > 0 ? spent / b.limitCents : 0 };
  });
}

export const goalSaved = (fin, goalId) => fin.goalDeposits.reduce((s, d) => (d.goalId === goalId ? s + d.amountCents : s), 0);

/* ------------------------------ projeção de fluxo de caixa ------------------------------ */
export function projection(fin, months = 6, today = todayISO()) {
  const startKey = monthOf(today);
  let balance = sumValues(accountBalances(fin));
  const invoices = computeInvoices(fin);
  const out = [];
  for (let i = 0; i < months; i++) {
    const key = addMonthKey(startKey, i);
    let income = 0, expense = 0;
    fin.transactions.forEach((tx) => {
      if (tx.status !== "planned" || (tx.type === "expense" && tx.cardId)) return;
      const k = tx.date < today ? startKey : monthOf(tx.date); // planeadas em atraso entram no mês atual
      if (k !== key) return;
      if (tx.type === "income") income += tx.amountCents;
      if (tx.type === "expense") expense += tx.amountCents; // transferências entre contas próprias: efeito líquido 0
    });
    invoices.forEach((inv) => {
      const k = inv.dueDate < today ? startKey : monthOf(inv.dueDate);
      if (k === key) expense += inv.remainingCents;
    });
    balance += income - expense;
    out.push({ month: key, income, expense, net: income - expense, endBalance: balance });
  }
  return out;
}

/* ------------------------------ criação de transações ------------------------------ */
function splitCents(total, n) {
  const base = Math.floor(total / n), rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i === 0 ? rem : 0));
}

// spec: { type, amountCents, date, description, categoryId, accountId, toAccountId, cardId, status, installments, recurrence:{freq,endDate}, taskId }
export function addTransaction(fin, spec) {
  const card = spec.cardId ? fin.cards.find((c) => c.id === spec.cardId) : null;
  const base = { description: spec.description || "", categoryId: spec.categoryId || null, taskId: spec.taskId || null };
  const mk = (over) => ({ id: uidF(), type: spec.type, status: spec.status || "done", ...base, ...over });
  const txs = [];

  if (spec.type === "transfer") {
    txs.push(mk({ amountCents: spec.amountCents, date: spec.date, accountId: spec.accountId, toAccountId: spec.toAccountId, cardId: null, categoryId: null }));
  } else if (spec.type === "income") {
    txs.push(mk({ amountCents: spec.amountCents, date: spec.date, accountId: spec.accountId, cardId: null }));
  } else {
    const n = Math.max(1, Math.min(60, spec.installments || 1));
    const parts = splitCents(spec.amountCents, n);
    const groupId = n > 1 ? uidF() : null;
    parts.forEach((cents, i) => {
      const date = addMonthsISO(spec.date, i);
      txs.push(mk({
        amountCents: cents, date,
        status: i === 0 ? (spec.status || "done") : "planned",
        accountId: card ? null : spec.accountId, cardId: card ? card.id : null,
        invoiceMonth: card ? invoiceMonth(card, date) : null,
        installmentGroupId: groupId, installmentNo: n > 1 ? i + 1 : null, installmentTotal: n > 1 ? n : null,
      }));
    });
  }

  let recurrences = fin.recurrences;
  if (spec.recurrence && spec.recurrence.freq && spec.type !== "transfer" || (spec.recurrence && spec.type === "transfer")) {
    const rec = { id: uidF(), type: spec.type, amountCents: spec.amountCents, description: spec.description || "", categoryId: spec.categoryId || null,
      accountId: card ? null : spec.accountId, toAccountId: spec.toAccountId || null, cardId: card ? card.id : null,
      freq: spec.recurrence.freq, startDate: spec.date, endDate: spec.recurrence.endDate || null };
    recurrences = [...recurrences, rec];
    txs[0].recurrenceId = rec.id; // a 1.ª ocorrência é a própria transação criada
  }
  return { ...fin, transactions: [...fin.transactions, ...txs], recurrences };
}

// Gera as ocorrências planeadas das recorrências até ao horizonte (idempotente).
export function materializeRecurrences(fin, horizonISO) {
  const existing = new Set(fin.transactions.filter((t) => t.recurrenceId).map((t) => `${t.recurrenceId}|${t.date}`));
  const add = [];
  fin.recurrences.forEach((rec) => {
    const card = rec.cardId ? fin.cards.find((c) => c.id === rec.cardId) : null;
    let i = 0, date = rec.startDate;
    while (date <= horizonISO && i < 800) {
      if (rec.endDate && date > rec.endDate) break;
      const k = `${rec.id}|${date}`;
      if (!existing.has(k)) {
        add.push({ id: uidF(), type: rec.type, amountCents: rec.amountCents, date, status: "planned", description: rec.description, categoryId: rec.categoryId,
          accountId: rec.accountId, toAccountId: rec.toAccountId, cardId: rec.cardId, invoiceMonth: card ? invoiceMonth(card, date) : null, recurrenceId: rec.id, taskId: null });
        existing.add(k);
      }
      i++;
      date = rec.freq === "weekly" ? addDaysISO(rec.startDate, 7 * i) : addMonthsISO(rec.startDate, (rec.freq === "yearly" ? 12 : 1) * i);
    }
  });
  return add.length ? { ...fin, transactions: [...fin.transactions, ...add] } : fin;
}

export function payInvoice(fin, { cardId, month, accountId, date, amountCents }) {
  const inv = computeInvoices(fin).find((i) => i.cardId === cardId && i.month === month);
  const amount = amountCents != null ? amountCents : inv ? inv.remainingCents : 0;
  if (!amount || amount <= 0) return fin;
  const tx = { id: uidF(), type: "card_payment", status: "done", amountCents: amount, date, accountId, cardId, invoiceMonth: month, description: "", categoryId: null, taskId: null };
  return { ...fin, transactions: [...fin.transactions, tx] };
}

// Junta dados importados sem duplicar (por id).
export function mergeFinance(fin, incoming) {
  const inc = normalizeFinance(incoming);
  const mergeBy = (a, b) => { const ids = new Set(a.map((x) => x.id)); return [...a, ...b.filter((x) => x && x.id && !ids.has(x.id))]; };
  return { ...fin, currency: fin.currency || inc.currency,
    accounts: mergeBy(fin.accounts, inc.accounts), cards: mergeBy(fin.cards, inc.cards), categories: mergeBy(fin.categories, inc.categories),
    transactions: mergeBy(fin.transactions, inc.transactions), recurrences: mergeBy(fin.recurrences, inc.recurrences),
    budgets: mergeBy(fin.budgets, inc.budgets), goals: mergeBy(fin.goals, inc.goals), goalDeposits: mergeBy(fin.goalDeposits, inc.goalDeposits) };
}
