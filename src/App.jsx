import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LayoutDashboard, Columns3, DatabaseBackup, Plus, X,
  Clock, CalendarDays, Camera, Image as ImageIcon, Bell, Trash2,
  Pencil, Check, EyeOff, Eye, AlertTriangle, CalendarPlus,
  Download, Upload, Briefcase, User, GripVertical,
  Mic, Repeat, FileText, Link2, StickyNote, MapPin, MessageSquare,
  Paperclip, ChevronLeft, ChevronRight, Milestone,
  List as ListIcon, Calendar as CalendarIcon, Sun, Moon, BellRing, BellOff, Sparkles, Smartphone, Bot, Send, Settings, AlarmClock, ShieldCheck, HeartPulse, Droplets, Globe,
} from "lucide-react";
import {
  isNative, nativeStatus, nativeRequestNotifications, nativeOpenNotificationSettings, nativeOpenExactAlarmSettings,
  nativeRequestBatteryExemption, nativeSetKeepAlive, nativeTest, nativeSyncReminders, nativeDrainActions,
  nativeOnAction, nativeSetClockAlarm, nativeListen, nativeShareFile, nativeSetWater, nativeTestWater,
} from "./native.js";
import { LANGS, t, setLang, detectLang, locale, voiceLang, langInfo, hydrationTips } from "./i18n.js";

setLang(detectLang());

/* ------------------------------------------------------------------ */
/*  Design tokens (light / dark palettes, applied via CSS variables)   */
/* ------------------------------------------------------------------ */
const LIGHT_PALETTE = {
  bg: "#F6F5F1",
  surface: "#FFFFFF",
  surfaceSunk: "#EFEDE6",
  ink: "#1C1F24",
  inkSoft: "#6B6F76",
  border: "#E2DFD5",
  primary: "#0F6E5E",
  primaryDark: "#0A5145",
  primarySoft: "#DEEFEA",
  accent: "#FF6B4A",
  accentSoft: "#FFE6DE",
  pessoal: "#7C6FE0",
  pessoalSoft: "#EBE8FB",
  profissional: "#1C7C6B",
  profissionalSoft: "#DDF0EB",
  q1: "#E4572E",
  q1Soft: "#FBE4DC",
  q2: "#0F6E5E",
  q2Soft: "#DEEFEA",
  q3: "#DDA22A",
  q3Soft: "#FBF0DA",
  q4: "#8B93A7",
  q4Soft: "#EAECF0",
  danger: "#C0392B",
  dangerSoft: "#FBE4DC",
};

const DARK_PALETTE = {
  bg: "#15171B",
  surface: "#1D2025",
  surfaceSunk: "#262A31",
  ink: "#F0EFEA",
  inkSoft: "#9BA1AC",
  border: "#33373F",
  primary: "#33B69B",
  primaryDark: "#1F8770",
  primarySoft: "#173832",
  accent: "#FF8A6B",
  accentSoft: "#3B2419",
  pessoal: "#A599F5",
  pessoalSoft: "#2A2540",
  profissional: "#3FBFA4",
  profissionalSoft: "#173832",
  q1: "#F0805A",
  q1Soft: "#3B2319",
  q2: "#33B69B",
  q2Soft: "#173832",
  q3: "#EAC15C",
  q3Soft: "#3B2F16",
  q4: "#9298A8",
  q4Soft: "#262A31",
  danger: "#E37768",
  dangerSoft: "#3B2319",
};

// C exposes the same keys as the palettes, but every value is a CSS variable
// reference. The variables themselves are set on the root wrapper based on
// the active theme, so every component below stays theme-agnostic.
const C = Object.fromEntries(Object.keys(LIGHT_PALETTE).map((k) => [k, `var(--v-${k})`]));

function cssVarsFor(theme) {
  const palette = theme === "dark" ? DARK_PALETTE : LIGHT_PALETTE;
  const vars = {};
  Object.entries(palette).forEach(([k, v]) => { vars[`--v-${k}`] = v; });
  return vars;
}

const THEME_STORAGE_KEY = "vivaro:theme";
const FIRED_REMINDERS_KEY = "vivaro:firedReminders";
const REMINDER_MS = { minutes: 60 * 1000, hours: 60 * 60 * 1000, days: 24 * 60 * 60 * 1000 };

// Gemini API key: set as a Netlify environment variable named VITE_GEMINI_API_KEY
// (Site settings → Environment variables), then trigger a new deploy. Vite bakes
// it into the built JS at build time — it is NOT committed to the repository.
// For safety, restrict this key by HTTP referrer to your Netlify domain in
// Google Cloud Console → APIs & Services → Credentials.
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || "";
// Modelo do Gemini: ver GEMINI_MODEL_CANDIDATES mais abaixo (lista com fallback automático)

const QUADRANTS = [
  { id: 1, get label() { return t("Fazer agora"); }, get sub() { return t("Urgente + Importante"); }, color: C.q1, soft: C.q1Soft },
  { id: 2, get label() { return t("Planejar"); }, get sub() { return t("Importante, não urgente"); }, color: C.q2, soft: C.q2Soft },
  { id: 3, get label() { return t("Delegar"); }, get sub() { return t("Urgente, não importante"); }, color: C.q3, soft: C.q3Soft },
  { id: 4, get label() { return t("Eliminar"); }, get sub() { return t("Nem urgente, nem importante"); }, color: C.q4, soft: C.q4Soft },
];

const STATUSES = [
  { id: "pendente", get label() { return t("Pendente"); }, color: "#8B93A7" },
  { id: "em_andamento", get label() { return t("Em andamento"); }, color: "#2E86DE" },
  { id: "aguarda_tratamento", get label() { return t("Aguarda tratamento"); }, color: "#DDA22A" },
  { id: "cancelado", get label() { return t("Cancelado"); }, color: "#9A9A9A" },
  { id: "concluido", get label() { return t("Concluído"); }, color: "#0F6E5E" },
];

const REMINDER_UNITS = [
  { id: "minutes", get label() { return t("minutos"); } },
  { id: "hours", get label() { return t("horas"); } },
  { id: "days", get label() { return t("dias"); } },
];

const RECURRENCE_OPTIONS = [
  { id: "", get label() { return t("Não repete"); } },
  { id: "daily", get label() { return t("Todos os dias"); } },
  { id: "weekday", get label() { return t("Todo dia útil"); } },
  { id: "weekly", get label() { return t("Semanalmente"); } },
  { id: "interval", get label() { return t("A cada X dias"); } },
  { id: "monthly_day", get label() { return t("Mensalmente (mesmo dia)"); } },
  { id: "monthly_last_business", get label() { return t("Último dia útil do mês"); } },
  { id: "monthly_first", get label() { return t("Primeiro dia de cada mês"); } },
  { id: "after_completion", get label() { return t("A cada X dias após concluir"); } },
];

// 2024-01-07 foi um domingo: usamos o Intl para obter os dias da semana no idioma atual
const weekdayShort = () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString(locale(), { weekday: "short" }));
const weekdayNarrow = () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 7 + i).toLocaleDateString(locale(), { weekday: "narrow" }));

const STORAGE_KEY = "vivaro:tasks:v2";
// Caminho base onde o app está publicado (definido em vite.config.js). Usar isso
// em vez de "/logo.png" etc. faz os caminhos funcionarem tanto na raiz quanto
// numa subpasta como /vivaro/.
const BASE = import.meta.env.BASE_URL;

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString(locale(), { day: "2-digit", month: "short" });
}

function fmtTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (d.getHours() === 0 && d.getMinutes() === 0) return null;
  return d.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" });
}

function isOverdue(task) {
  if (!task.dueAt) return false;
  if (task.status === "concluido" || task.status === "cancelado") return false;
  return new Date(task.dueAt).getTime() < Date.now();
}

function googleCalendarUrl(task) {
  const start = task.dueAt ? new Date(task.dueAt) : new Date();
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const fmt = (d) =>
    d.getUTCFullYear().toString().padStart(4, "0") +
    (d.getUTCMonth() + 1).toString().padStart(2, "0") +
    d.getUTCDate().toString().padStart(2, "0") +
    "T" +
    d.getUTCHours().toString().padStart(2, "0") +
    d.getUTCMinutes().toString().padStart(2, "0") +
    "00Z";
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: task.title || "Tarefa Vivaro",
    dates: `${fmt(start)}/${fmt(end)}`,
    details: (task.description || "") + `\n\nCategoria: ${task.category === "pessoal" ? "Pessoal" : "Profissional"} · Vivaro`,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function isWeekend(d) {
  const day = d.getDay();
  return day === 0 || day === 6;
}
function nextBusinessDay(d) {
  let n = addDays(d, 1);
  while (isWeekend(n)) n = addDays(n, 1);
  return n;
}
function lastDayOfMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0);
}
function lastBusinessDayOfMonth(year, monthIndex) {
  let d = lastDayOfMonth(year, monthIndex);
  while (isWeekend(d)) d.setDate(d.getDate() - 1);
  return d;
}
function firstDayOfNextMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}
function nextWeeklyOccurrence(date, weekDays) {
  let d = addDays(date, 1);
  for (let i = 0; i < 14; i++) {
    if (weekDays.includes(d.getDay())) return d;
    d = addDays(d, 1);
  }
  return addDays(date, 7);
}

function computeNextOccurrence(task) {
  if (!task.recurrence) return null;
  const rec = task.recurrence;
  const base = task.dueAt ? new Date(task.dueAt) : new Date();
  const time = { h: base.getHours(), m: base.getMinutes() };
  let next;
  switch (rec.type) {
    case "daily": next = addDays(base, 1); break;
    case "weekday": next = nextBusinessDay(base); break;
    case "weekly": next = nextWeeklyOccurrence(base, rec.weekDays?.length ? rec.weekDays : [base.getDay()]); break;
    case "interval": next = addDays(base, rec.intervalDays || 1); break;
    case "monthly_day": { const d = new Date(base); d.setMonth(d.getMonth() + 1); next = d; break; }
    case "monthly_last_business": { const d = firstDayOfNextMonth(base); next = lastBusinessDayOfMonth(d.getFullYear(), d.getMonth()); break; }
    case "monthly_first": next = firstDayOfNextMonth(base); break;
    case "after_completion": { const compBase = task.completedAt ? new Date(task.completedAt) : new Date(); next = addDays(compBase, rec.intervalDays || 1); break; }
    default: return null;
  }
  next.setHours(time.h, time.m, 0, 0);
  return next.toISOString();
}

function recurrenceLabel(rec) {
  if (!rec) return "";
  if (rec.type === "weekly" && rec.weekDays?.length) {
    return t("Toda(s) {days}", { days: rec.weekDays.map((d) => weekdayShort()[d]).join(", ") });
  }
  if (rec.type === "interval") return t("A cada {n} dias", { n: rec.intervalDays || 1 });
  if (rec.type === "after_completion") return t("{n}d após concluir", { n: rec.intervalDays || 1 });
  const opt = RECURRENCE_OPTIONS.find((o) => o.id === rec.type);
  return opt?.label || "Repete";
}

function normalizeTask(t) {
  let attachments = Array.isArray(t.attachments) ? [...t.attachments] : [];
  if (t.image && !attachments.some((a) => a.kind === "image" && a.dataUrl === t.image)) {
    attachments.push({ id: uid(), kind: "image", name: "Imagem", dataUrl: t.image });
  }
  return {
    ...t,
    attachments,
    subtasks: Array.isArray(t.subtasks) ? t.subtasks : [],
    comments: Array.isArray(t.comments) ? t.comments : [],
    watchers: Array.isArray(t.watchers) ? t.watchers : [],
    reminders: Array.isArray(t.reminders) ? t.reminders : [],
    assignee: t.assignee || "",
    recurrence: t.recurrence || null,
    completedAt: t.completedAt || null,
    alarmMode: !!t.alarmMode,
    clockAlarm: !!t.clockAlarm,
  };
}

// Monta um resumo compacto das tarefas para servir de contexto à IA
function buildTasksContext(tasks) {
  if (!tasks.length) return "Nenhuma tarefa cadastrada.";
  const sorted = sortByPriority(tasks);
  return sorted
    .map((t) => {
      const st = STATUSES.find((s) => s.id === t.status)?.label || t.status;
      const q = QUADRANTS.find((x) => x.id === t.quadrant)?.label || "";
      const prazo = t.dueAt ? `${fmtDate(t.dueAt)}${fmtTime(t.dueAt) ? ` ${fmtTime(t.dueAt)}` : ""}` : "sem prazo";
      const atraso = isOverdue(t) ? " · ATRASADA" : "";
      const sub = (t.subtasks || []).length ? ` · subtarefas ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}` : "";
      const resp = t.assignee ? ` · responsável: ${t.assignee}` : "";
      const rec = t.recurrence ? ` · recorrente (${recurrenceLabel(t.recurrence)})` : "";
      return `- id:${t.id} [${st}] ${t.title} (${t.category}, prioridade: ${q}, prazo: ${prazo}${atraso}${sub}${resp}${rec})`;
    })
    .join("\n");
}

// Monta/atualiza um objeto de tarefa a partir dos campos que a IA devolveu
function buildTaskFromAI(fields, existing) {
  const base = existing
    ? { ...existing }
    : {
        id: uid(), title: "", description: "", category: "pessoal", quadrant: 2, status: "pendente",
        dueAt: null, reminders: [], attachments: [], subtasks: [], assignee: "", watchers: [], comments: [],
        recurrence: null, completedAt: null, createdAt: new Date().toISOString(),
      };
  const merged = { ...base };
  if (typeof fields.title === "string" && fields.title.trim()) merged.title = fields.title.trim();
  if (typeof fields.description === "string") merged.description = fields.description;
  if (fields.category === "pessoal" || fields.category === "profissional") merged.category = fields.category;
  const q = Number(fields.quadrant);
  if ([1, 2, 3, 4].includes(q)) merged.quadrant = q;
  if (STATUSES.some((s) => s.id === fields.status)) merged.status = fields.status;
  if (fields.dueDate === null) {
    merged.dueAt = null;
  } else if (typeof fields.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fields.dueDate)) {
    const time = typeof fields.dueTime === "string" && /^\d{2}:\d{2}$/.test(fields.dueTime) ? fields.dueTime : "00:00";
    const d = new Date(`${fields.dueDate}T${time}:00`);
    if (!isNaN(d.getTime())) merged.dueAt = d.toISOString();
  }
  if (typeof fields.assignee === "string") merged.assignee = fields.assignee;
  merged.completedAt = merged.status === "concluido" ? (merged.completedAt || new Date().toISOString()) : null;
  return merged;
}

// Chama a API do Gemini diretamente do navegador (chave restrita por domínio).
// Lista de modelos candidatos, do preferido ao mais antigo — se o primeiro sumir
// (a Google renomeia modelos de tempos em tempos), o app tenta o próximo sozinho.
const GEMINI_MODEL_CANDIDATES = ["gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-2.5-flash-lite", "gemini-2.5-flash"];
let workingGeminiModel = null; // cache do último modelo que funcionou nesta sessão

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function callGeminiOnce(prompt, model) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );
  if (!res.ok) {
    if (res.status === 429) {
      const err = new Error("Limite de pedidos do Gemini atingido no momento (pode ser o limite por minuto — geralmente libera rápido). Tente de novo em instantes; se persistir, pode ser o limite diário gratuito.");
      err.retryable = true;
      err.retryDelays = [4000, 10000];
      throw err;
    }
    if (res.status === 404) {
      const err = new Error(`Modelo "${model}" não encontrado.`);
      err.modelNotFound = true;
      throw err;
    }
    if (res.status === 403) throw new Error("Acesso negado pela API (403). Confira a restrição por domínio da chave no Google Cloud Console.");
    if (res.status === 503 || res.status === 500) {
      const err = new Error("O servidor do Gemini está sobrecarregado no momento. Tente novamente em instantes.");
      err.retryable = true;
      err.retryDelays = [1000, 2500];
      throw err;
    }
    throw new Error(`Erro ao consultar a IA (${res.status}).`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
}

// Tenta um modelo específico, com retry automático em erros transitórios (429/503).
async function callWithRetry(prompt, model) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await callGeminiOnce(prompt, model);
    } catch (err) {
      const delays = err.retryDelays || [];
      if (err.retryable && attempt < delays.length) {
        await sleep(delays[attempt]);
        continue;
      }
      throw err;
    }
  }
}

// Pergunta ao Gemini e devolve { reply, actions } — actions são comandos que o
// app executa (criar/editar/concluir/excluir tarefas), permitindo que a IA
// funcione como um assistente pessoal que gerencia as tarefas, não só responde.
async function askGemini(question, tasks) {
  if (!GEMINI_API_KEY) {
    throw new Error("A chave da API do Gemini ainda não foi configurada nesta implantação.");
  }
  const prompt = `IDIOMA DE RESPOSTA: responda SEMPRE em ${langInfo().ai} (o campo "reply"), mesmo que a pergunta venha em outro idioma. Os nomes das chaves do JSON e os valores técnicos (ids, status, datas ISO) permanecem exatamente como especificado abaixo.

Você é o assistente pessoal do app Vivaro, um app de gerenciamento de tarefas. Você ajuda o usuário tanto respondendo perguntas quanto gerenciando as tarefas dele diretamente (criando, editando, concluindo ou excluindo). A data e hora atuais são ${new Date().toLocaleString(locale())}.

REGRA MAIS IMPORTANTE SOBRE CONHECIMENTO: a lista de tarefas abaixo existe só para você saber QUAIS tarefas o usuário tem (títulos, prazos, ids) — ela NUNCA deve limitar o conteúdo da sua resposta. Se o usuário pedir ajuda para resolver, executar ou entender como fazer algo (ex.: "como resolvo isso", "como consigo X", "me ajuda com Y", mesmo mencionando o nome de uma tarefa), responda com informação real e útil sobre o assunto, usando todo o seu conhecimento geral, exatamente como faria em qualquer conversa livre — a tarefa é apenas o motivo da pergunta, não uma cerca ao redor da resposta. NUNCA responda algo como "com base apenas nas informações da tarefa, não é possível..." — isso está proibido. Só admita não saber se for algo verdadeiramente impossível de responder com conhecimento geral (ex.: um dado privado que só existiria na cabeça do usuário).

VOCÊ PODE GERENCIAR TAREFAS DE VERDADE: quando o usuário pedir para criar, alterar, marcar como concluída, adiar, mudar prioridade/categoria ou excluir uma tarefa, você DEVE incluir o objeto de ação correspondente no array "actions" — isso é o que faz a ação acontecer de verdade no app. É PROIBIDO dizer no "reply" que uma tarefa foi criada/alterada/excluída sem incluir a ação correspondente em "actions" — isso engana o usuário, já que nada seria feito de verdade. Cada pedido de gerenciamento de tarefa SEMPRE precisa de uma ação em "actions", nunca apenas texto descrevendo o que "deveria" ser feito.

IDs de tarefas existentes só podem ser usados se aparecerem exatamente (copiados) na lista abaixo — nunca invente ou abrevie um id.

Categorias válidas: "pessoal", "profissional". Prioridades (quadrant): 1=Fazer agora (urgente+importante), 2=Planejar (importante, não urgente), 3=Delegar (urgente, não importante), 4=Eliminar. Estados (status): "pendente", "em_andamento", "aguarda_tratamento", "cancelado", "concluido".

Responda ESTRITAMENTE em JSON válido, sem nenhum texto fora do JSON e sem markdown, no formato exato:
{
  "reply": "sua resposta em texto para mostrar ao usuário no chat",
  "actions": [ { ... } ]
}

Exemplos de itens válidos dentro de "actions":
{ "type": "create_task", "title": "Comprar leite", "description": "", "category": "pessoal", "quadrant": 3, "status": "pendente", "dueDate": "2026-08-20", "dueTime": "10:00" }
{ "type": "update_task", "id": "abc123", "dueDate": "2026-08-22", "dueTime": null }
{ "type": "complete_task", "id": "abc123" }
{ "type": "delete_task", "id": "abc123" }

Em "update_task", inclua apenas os campos que devem mudar (omita os demais, não repita os que não mudam). Se a pergunta não pedir nenhuma alteração nas tarefas, "actions" deve ser um array vazio [].

TAREFAS DO USUÁRIO (use o valor exato de "id" para referenciar uma tarefa):
${buildTasksContext(tasks)}

PERGUNTA: ${question}`;

  // Tenta o modelo que já funcionou antes primeiro (se houver), depois percorre
  // a lista de candidatos — cada um com retry automático em erros transitórios.
  const candidates = workingGeminiModel
    ? [workingGeminiModel, ...GEMINI_MODEL_CANDIDATES.filter((m) => m !== workingGeminiModel)]
    : GEMINI_MODEL_CANDIDATES;

  let raw = "";
  let lastErr = null;
  for (const model of candidates) {
    try {
      raw = await callWithRetry(prompt, model);
      workingGeminiModel = model;
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      if (err.modelNotFound) continue; // tenta o próximo candidato
      throw err; // erro real (limite, permissão, etc.) — não adianta trocar de modelo
    }
  }
  if (lastErr) {
    throw new Error("Nenhum modelo de IA disponível no momento (todos retornaram 404). Avise para eu atualizar a lista de modelos.");
  }

  return parseAIResponse(raw);
}

// Faz o parsing da resposta da IA de forma tolerante: remove blocos de código
// markdown que o modelo às vezes inclui mesmo em modo JSON, e tenta extrair o
// primeiro objeto JSON válido do texto antes de desistir.
function parseAIResponse(raw) {
  const tryParse = (text) => {
    try { return JSON.parse(text); } catch (e) { return null; }
  };

  let cleaned = raw.trim().replace(/^```json\s*|^```\s*|```$/gi, "").trim();
  let parsed = tryParse(cleaned);

  if (!parsed) {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      parsed = tryParse(cleaned.slice(start, end + 1));
    }
  }

  if (!parsed) {
    return { reply: raw || "Não consegui gerar uma resposta para essa pergunta.", actions: [], parseFailed: true };
  }

  return {
    reply: typeof parsed.reply === "string" && parsed.reply.trim() ? parsed.reply.trim() : "Feito.",
    actions: Array.isArray(parsed.actions) ? parsed.actions : [],
    parseFailed: false,
  };
}



function parseVoiceText(raw) {
  const text = raw.trim();
  const lower = text.toLowerCase();
  const now = new Date();
  let date = null;
  let time = null;
  const matchedSpans = [];

  const timeMatch = lower.match(/(^|\s)[àa]s\s+(\d{1,2})(?:[:h](\d{2}))?/i);
  if (timeMatch) {
    time = { h: parseInt(timeMatch[2], 10), m: timeMatch[3] ? parseInt(timeMatch[3], 10) : 0 };
    matchedSpans.push(timeMatch[0].trim());
  }

  if (lower.includes("amanhã") || lower.includes("amanha")) {
    date = addDays(now, 1);
    matchedSpans.push(lower.includes("amanhã") ? "amanhã" : "amanha");
  } else if (lower.includes("hoje")) {
    date = new Date(now);
    matchedSpans.push("hoje");
  } else {
    const weekdayMap = { domingo: 0, segunda: 1, terça: 2, terca: 2, quarta: 3, quinta: 4, sexta: 5, sábado: 6, sabado: 6 };
    const wdMatch = lower.match(/domingo|segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado/);
    if (wdMatch) {
      const target = weekdayMap[wdMatch[0]];
      let d = addDays(now, 1);
      for (let i = 0; i < 8; i++) { if (d.getDay() === target) { date = d; break; } d = addDays(d, 1); }
      matchedSpans.push(wdMatch[0]);
    } else {
      const inDays = lower.match(/daqui a (\d+) dias?/);
      if (inDays) { date = addDays(now, parseInt(inDays[1], 10)); matchedSpans.push(inDays[0]); }
    }
  }

  let title = text;
  matchedSpans.forEach((span) => {
    title = title.replace(new RegExp(span.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), "");
  });
  title = title
    .replace(/lembr(ar|e)[- ]?me\s*(de)?/i, "")
    .replace(/^\s*(de|que|,)\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;!?])/g, "$1")
    .trim()
    .replace(/[.,;]+$/, "");
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1);

  let dueDate = "", dueTime = "";
  if (date) dueDate = date.toISOString().slice(0, 10);
  if (time) dueTime = `${String(time.h).padStart(2, "0")}:${String(time.m).padStart(2, "0")}`;

  const reminders = dueTime ? [{ id: uid(), value: 1, unit: "hours" }] : [];

  return { title: title || text, dueDate, dueTime, reminders };
}

/* ------------------------------------------------------------------ */
/*  Small UI primitives                                                */
/* ------------------------------------------------------------------ */
function Pill({ active, onClick, color, softColor, children, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all"
      style={{
        borderColor: active ? color : C.border,
        background: active ? softColor : "transparent",
        color: active ? color : C.inkSoft,
      }}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

function Badge({ color, soft, children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color, background: soft }}>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Eisenhower mini matrix                                             */
/* ------------------------------------------------------------------ */
function EisenhowerWidget({ tasks, activeQuadrant, onSelect }) {
  const counts = useMemo(() => {
    const m = { 1: 0, 2: 0, 3: 0, 4: 0 };
    tasks.forEach((t) => { if (t.status !== "concluido" && t.status !== "cancelado") m[t.quadrant]++; });
    return m;
  }, [tasks]);

  return (
    <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
      {QUADRANTS.map((q) => (
        <button
          key={q.id}
          onClick={() => onSelect(activeQuadrant === q.id ? null : q.id)}
          className="rounded-xl p-3 text-left transition-all border-2"
          style={{ background: q.soft, borderColor: activeQuadrant === q.id ? q.color : "transparent" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: q.color }}>{t("Q")}{q.id}</span>
            <span className="font-mono text-lg font-bold" style={{ color: q.color, fontFamily: "'IBM Plex Mono', monospace" }}>{counts[q.id]}</span>
          </div>
          <div className="text-sm font-semibold mt-0.5" style={{ color: C.ink }}>{q.label}</div>
          <div className="text-[11px]" style={{ color: C.inkSoft }}>{q.sub}</div>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Lightbox / Note viewer                                             */
/* ------------------------------------------------------------------ */
function Lightbox({ src, onClose }) {
  if (!src) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }} onClick={onClose}>
      <img src={src} alt="" className="max-h-[90vh] max-w-[90vw] rounded-xl" onClick={(e) => e.stopPropagation()} />
      <button onClick={onClose} className="absolute top-4 right-4 text-white"><X size={28} /></button>
    </div>
  );
}

function NoteViewer({ note, onClose }) {
  if (!note) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(28,31,36,0.5)" }} onClick={onClose}>
      <div className="max-w-sm w-full rounded-2xl p-5" style={{ background: C.surface }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold inline-flex items-center gap-1.5" style={{ color: C.ink }}><StickyNote size={16} /> {t("Nota")}</span>
          <button onClick={onClose}><X size={18} color={C.inkSoft} /></button>
        </div>
        <p className="text-sm whitespace-pre-wrap" style={{ color: C.ink }}>{note.text}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  About modal                                                        */
/* ------------------------------------------------------------------ */
function AboutModal({ onClose }) {
  const FEATURES = [
    { icon: LayoutDashboard, get text() { return t("Dashboard com matriz de Eisenhower e filtros por categoria, estado, prioridade e atraso"); } },
    { icon: Columns3, get text() { return t("Visões de Kanban, Lista, Calendário e Timeline para a mesma base de tarefas"); } },
    { icon: Repeat, get text() { return t("Recorrência inteligente: dias úteis, semanal, mensal e a cada X dias após concluir"); } },
    { icon: Check, get text() { return t("Subtarefas com progresso, responsável, observadores e comentários"); } },
    { icon: Paperclip, get text() { return t("Anexos de foto, imagem, PDF/documento, link, nota e localização"); } },
    { icon: Mic, get text() { return t("Criação e ditado de tarefas por voz"); } },
    { icon: CalendarPlus, get text() { return t("Exportação de tarefas para o Google Agenda"); } },
    { icon: DatabaseBackup, get text() { return t("Backup local em .json para exportar e restaurar suas tarefas"); } },
  ];
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(28,31,36,0.5)" }} onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl" style={{ background: C.surface }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 sticky top-0" style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <span className="font-bold text-lg inline-flex items-center gap-1.5" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}><Sparkles size={17} color={C.accent} /> {t("Sobre o Vivaro")}</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-60" style={{ color: C.inkSoft }}><X size={20} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div className="flex items-center gap-3">
            <img src={`${BASE}logo.png`} alt={t("Vivaro")} className="w-14 h-14 rounded-2xl object-contain" style={{ background: C.surfaceSunk }} />
            <div>
              <div className="font-bold text-base" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{t("Vivaro")}</div>
              <div className="text-xs" style={{ color: C.inkSoft }}>{t("Gerenciamento, controle e finalização de tarefas")}</div>
            </div>
          </div>

          <p className="text-sm leading-relaxed" style={{ color: C.inkSoft }}>
            {t("O Vivaro organiza suas tarefas pessoais e profissionais em um só lugar, priorizando pelo que realmente importa com a matriz de Eisenhower e acompanhando a execução em Kanban, Lista, Calendário ou Timeline.")}</p>

          <div>
            <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>{t("Principais recursos")}</div>
            <div className="space-y-2">
              {FEATURES.map((f, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: C.primarySoft }}>
                    <f.icon size={14} color={C.primary} />
                  </div>
                  <span className="text-sm mt-1" style={{ color: C.ink }}>{f.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 text-center" style={{ borderTop: `1px solid ${C.border}` }}>
          <div className="text-xs" style={{ color: C.inkSoft }}>{t("Vivaro")}</div>
          <div className="text-sm font-semibold mt-0.5" style={{ color: C.ink }}>{t("Autor: Jonas Rios")}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AI chat — pergunte sobre suas tarefas (Gemini API)                 */
/* ------------------------------------------------------------------ */
const AI_CHAT_HISTORY_KEY = "vivaro:aiChatHistory";
const AI_GREETING = { role: "ai", get text() { return t("Olá! Pergunte sobre suas tarefas, peça ajuda pra resolver alguma delas, ou peça pra eu criar, alterar, concluir ou excluir tarefas por você."); } };

function AIChatModal({ tasks, onCreateTask, onUpdateTask, onCompleteTask, onDeleteTask, onClose }) {
  const [messages, setMessages] = useState(() => {
    try {
      const raw = localStorage.getItem(AI_CHAT_HISTORY_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (Array.isArray(saved) && saved.length) return saved;
      }
    } catch (e) { /* ignore */ }
    return [{ id: uid(), ...AI_GREETING }];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages, loading]);

  useEffect(() => {
    try { localStorage.setItem(AI_CHAT_HISTORY_KEY, JSON.stringify(messages)); } catch (e) { /* ignore */ }
  }, [messages]);

  const clearChat = () => {
    const fresh = [{ id: uid(), ...AI_GREETING }];
    setMessages(fresh);
    try { localStorage.setItem(AI_CHAT_HISTORY_KEY, JSON.stringify(fresh)); } catch (e) { /* ignore */ }
  };

  const findTaskById = (id) => {
    const target = String(id || "").trim();
    return tasks.find((t) => t.id === target);
  };

  const applyAction = (action) => {
    try {
      if (action.type === "create_task") {
        const task = buildTaskFromAI(action);
        if (!task.title) return "⚠️ A IA tentou criar uma tarefa sem título — ação ignorada.";
        onCreateTask(task);
        return `✅ Tarefa criada: "${task.title}"`;
      }
      if (action.type === "update_task") {
        const existing = findTaskById(action.id);
        if (!existing) return `⚠️ Não encontrei a tarefa indicada para atualizar (id: ${action.id || "vazio"}).`;
        const task = buildTaskFromAI(action, existing);
        onUpdateTask(task);
        return `✏️ Tarefa atualizada: "${task.title}"`;
      }
      if (action.type === "complete_task") {
        const existing = findTaskById(action.id);
        if (!existing) return `⚠️ Não encontrei a tarefa indicada para concluir (id: ${action.id || "vazio"}).`;
        onCompleteTask(existing.id);
        return `☑️ Tarefa concluída: "${existing.title}"`;
      }
      if (action.type === "delete_task") {
        const existing = findTaskById(action.id);
        if (!existing) return `⚠️ Não encontrei a tarefa indicada para excluir (id: ${action.id || "vazio"}).`;
        onDeleteTask(existing.id);
        return `🗑️ Tarefa excluída: "${existing.title}"`;
      }
    } catch (e) {
      return "⚠️ Não consegui aplicar uma das ações pedidas (formato inesperado).";
    }
    return null;
  };

  const send = async () => {
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { id: uid(), role: "user", text: question }]);
    setLoading(true);
    try {
      const { reply, actions, parseFailed } = await askGemini(question, tasks);
      const confirmations = actions.map(applyAction).filter(Boolean);
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "ai", text: reply },
        ...confirmations.map((text) => ({ id: uid(), role: "system", text })),
        ...(parseFailed ? [{ id: uid(), role: "system", get text() { return t("⚠️ A resposta veio num formato inesperado — se você pediu pra criar/alterar/excluir algo, tente reformular a pergunta."); } }] : []),
      ]);
    } catch (err) {
      setMessages((prev) => [...prev, { id: uid(), role: "ai", text: `⚠️ ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(28,31,36,0.5)" }}>
      <div className="w-full sm:max-w-lg h-[85vh] sm:h-[70vh] flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden" style={{ background: C.surface }}>
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: `1px solid ${C.border}` }}>
          <span className="font-bold text-lg inline-flex items-center gap-1.5" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>
            <Bot size={18} color={C.primary} /> {t("Assistente")}</span>
          <div className="flex items-center gap-1">
            <button onClick={clearChat} title={t("Limpar conversa")} className="p-1.5 rounded-lg hover:opacity-60" style={{ color: C.inkSoft }}><Trash2 size={17} /></button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-60" style={{ color: C.inkSoft }}><X size={20} /></button>
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((m) =>
            m.role === "system" ? (
              <div key={m.id} className="flex justify-center">
                <div className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: C.primarySoft, color: C.primaryDark }}>{m.text}</div>
              </div>
            ) : (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap"
                  style={{
                    background: m.role === "user" ? C.primary : C.surfaceSunk,
                    color: m.role === "user" ? "#fff" : C.ink,
                  }}
                >
                  {m.text}
                </div>
              </div>
            )
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl px-3.5 py-2.5 text-sm" style={{ background: C.surfaceSunk, color: C.inkSoft }}>{t("Pensando...")}</div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-4 py-3" style={{ borderTop: `1px solid ${C.border}` }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
            placeholder={t("Ex: o que tenho pra fazer essa semana?")}
            className="flex-1 px-3 py-2.5 rounded-xl outline-none border text-sm"
            style={{ borderColor: C.border, color: C.ink }}
          />
          <DictateFieldButton title={t("Perguntar por voz")} onText={(t) => setInput((prev) => (prev ? `${prev} ${t}` : t))} />
          <button onClick={send} disabled={!input.trim() || loading} className="p-2.5 rounded-xl text-white disabled:opacity-40" style={{ background: C.primary }}>
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Task Card                                                          */
/* ------------------------------------------------------------------ */
function TaskCard({ task, onEdit, onDelete, onStatusChange, onExport, onOpenAttachment, draggable, onDragStart }) {
  const q = QUADRANTS.find((x) => x.id === task.quadrant) || QUADRANTS[3];
  const st = STATUSES.find((s) => s.id === task.status) || STATUSES[0];
  const overdue = isOverdue(task);
  const catColor = task.category === "pessoal" ? C.pessoal : C.profissional;
  const catSoft = task.category === "pessoal" ? C.pessoalSoft : C.profissionalSoft;
  const attachments = task.attachments || [];
  const images = attachments.filter((a) => a.kind === "image");
  const otherAttachments = attachments.filter((a) => a.kind !== "image");
  const subtasks = task.subtasks || [];
  const doneCount = subtasks.filter((s) => s.done).length;
  const pct = subtasks.length ? Math.round((doneCount / subtasks.length) * 100) : 0;
  const ICONS = { file: FileText, link: Link2, note: StickyNote, location: MapPin };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      className="rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow cursor-default"
      style={{ background: C.surface, border: `1px solid ${C.border}`, borderLeftWidth: 4, borderLeftColor: q.color }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge color={catColor} soft={catSoft}>{task.category === "pessoal" ? t("Pessoal") : t("Profissional")}</Badge>
          <Badge color={q.color} soft={q.soft}>{q.label}</Badge>
          {task.recurrence && (
            <Badge color={C.primary} soft={C.primarySoft}><Repeat size={11} style={{ marginRight: 3 }} />{recurrenceLabel(task.recurrence)}</Badge>
          )}
          {overdue && <Badge color={C.danger} soft={C.dangerSoft}><AlertTriangle size={11} style={{ marginRight: 3 }} /> {t("Atrasada")}</Badge>}
        </div>
        {draggable && <GripVertical size={14} color={C.inkSoft} />}
      </div>

      <div className="mt-2 font-semibold text-[15px] leading-snug" style={{ color: C.ink }}>{task.title}</div>
      {task.description && <div className="text-sm mt-0.5 line-clamp-2" style={{ color: C.inkSoft }}>{task.description}</div>}

      {images[0] && (
        <img src={images[0].dataUrl} alt="" onClick={() => onOpenAttachment?.(images[0])} className="mt-2 rounded-lg max-h-32 w-full object-cover cursor-pointer" />
      )}

      {otherAttachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {otherAttachments.map((a) => {
            const Icon = ICONS[a.kind] || Paperclip;
            return (
              <button key={a.id} onClick={() => onOpenAttachment?.(a)} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium" style={{ background: C.surfaceSunk, color: C.ink }}>
                <Icon size={11} /> <span className="max-w-[90px] truncate">{a.name}</span>
              </button>
            );
          })}
        </div>
      )}

      {subtasks.length > 0 && (
        <div className="mt-2.5">
          <div className="text-[11px] font-semibold mb-1" style={{ color: C.inkSoft }}>{doneCount}/{subtasks.length} {t("concluídas ·")} {pct}%</div>
          <div className="h-1.5 rounded-full w-full" style={{ background: C.surfaceSunk }}>
            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, background: C.primary }} />
          </div>
        </div>
      )}

      <div className="flex items-center flex-wrap gap-2 mt-3 text-xs" style={{ color: C.inkSoft }}>
        {task.dueAt && (
          <span className="inline-flex items-center gap-1" style={{ color: overdue ? C.danger : C.inkSoft, fontWeight: overdue ? 700 : 500 }}>
            <CalendarDays size={12} /> {fmtDate(task.dueAt)}{fmtTime(task.dueAt) ? ` · ${fmtTime(task.dueAt)}` : ""}
          </span>
        )}
        {task.reminders?.length > 0 && <span className="inline-flex items-center gap-1"><Bell size={12} /> {task.reminders.length}</span>}
        {task.comments?.length > 0 && <span className="inline-flex items-center gap-1"><MessageSquare size={12} /> {task.comments.length}</span>}
        {task.assignee && (
          <span className="inline-flex items-center gap-1 ml-auto font-semibold px-1.5 py-0.5 rounded-full" style={{ background: C.surfaceSunk, color: C.ink }}>{task.assignee}</span>
        )}
      </div>

      <div className="flex items-center justify-between mt-3 pt-2.5" style={{ borderTop: `1px solid ${C.border}` }}>
        <select
          value={task.status}
          onChange={(e) => onStatusChange(task.id, e.target.value)}
          className="text-xs font-semibold rounded-lg px-2 py-1 border outline-none"
          style={{ borderColor: C.border, color: st.color, background: C.bg }}
        >
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <div className="flex items-center gap-1">
          <button title={t("Exportar para Google Agenda")} onClick={() => onExport(task)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: C.primary }}><CalendarPlus size={15} /></button>
          <button title={t("Editar")} onClick={() => onEdit(task)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: C.inkSoft }}><Pencil size={14} /></button>
          <button title={t("Excluir")} onClick={() => onDelete(task.id)} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: C.danger }}><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Editors used inside the modal                                      */
/* ------------------------------------------------------------------ */
function TagInput({ values, onChange, placeholder }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const v = draft.trim();
    if (!v) return;
    if (!values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {values.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium" style={{ background: C.surfaceSunk, color: C.ink }}>
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ borderColor: C.border, color: C.ink }}
        />
        <button type="button" onClick={add} className="px-3 py-2 rounded-lg text-sm font-semibold border" style={{ borderColor: C.border, color: C.ink }}>+</button>
      </div>
    </div>
  );
}

function SubtaskEditor({ subtasks, onChange }) {
  const add = () => onChange([...subtasks, { id: uid(), title: "", done: false }]);
  const update = (id, patch) => onChange(subtasks.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id) => onChange(subtasks.filter((s) => s.id !== id));
  const done = subtasks.filter((s) => s.done).length;
  return (
    <div>
      {subtasks.length > 0 && (
        <div className="text-xs font-semibold mb-2" style={{ color: C.inkSoft }}>
          {done}/{subtasks.length} {t("concluídas ·")} {Math.round((done / subtasks.length) * 100)}%
        </div>
      )}
      <div className="space-y-1.5">
        {subtasks.map((s) => (
          <div key={s.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => update(s.id, { done: !s.done })}
              className="w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0"
              style={{ borderColor: s.done ? C.primary : C.border, background: s.done ? C.primary : "transparent" }}
            >
              {s.done && <Check size={12} color="#fff" />}
            </button>
            <input
              value={s.title}
              onChange={(e) => update(s.id, { title: e.target.value })}
              placeholder={t("Subtarefa...")}
              className="flex-1 px-2 py-1.5 rounded-lg border text-sm outline-none"
              style={{ borderColor: C.border, textDecoration: s.done ? "line-through" : "none", color: s.done ? C.inkSoft : C.ink }}
            />
            <button type="button" onClick={() => remove(s.id)} style={{ color: C.danger }}><X size={14} /></button>
          </div>
        ))}
      </div>
      <button type="button" onClick={add} className="text-xs font-semibold inline-flex items-center gap-1 mt-2" style={{ color: C.primary }}>
        <Plus size={13} /> {t("Adicionar subtarefa")}</button>
    </div>
  );
}

function RecurrenceEditor({ recurrence, onChange }) {
  const type = recurrence?.type || "";
  const setType = (t) => {
    if (!t) { onChange(null); return; }
    onChange({ type: t, weekDays: recurrence?.weekDays || [], intervalDays: recurrence?.intervalDays || 15 });
  };
  const toggleWeekDay = (d) => {
    const cur = recurrence?.weekDays || [];
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d];
    onChange({ ...recurrence, weekDays: next });
  };
  return (
    <div>
      <select value={type} onChange={(e) => setType(e.target.value)} className="w-full px-3 py-2.5 rounded-xl outline-none border text-sm font-medium" style={{ borderColor: C.border, color: C.ink }}>
        {RECURRENCE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
      {type === "weekly" && (
        <div className="flex gap-1.5 mt-2 flex-wrap">
          {weekdayShort().map((lbl, idx) => (
            <button
              type="button" key={idx} onClick={() => toggleWeekDay(idx)}
              className="w-9 h-9 rounded-full text-xs font-bold border"
              style={{
                borderColor: recurrence?.weekDays?.includes(idx) ? C.primary : C.border,
                background: recurrence?.weekDays?.includes(idx) ? C.primarySoft : "transparent",
                color: recurrence?.weekDays?.includes(idx) ? C.primary : C.inkSoft,
              }}
            >{lbl}</button>
          ))}
        </div>
      )}
      {(type === "interval" || type === "after_completion") && (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="number" min={1} value={recurrence?.intervalDays || 1}
            onChange={(e) => onChange({ ...recurrence, intervalDays: Math.max(1, parseInt(e.target.value) || 1) })}
            className="w-20 px-2 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: C.border, color: C.ink }}
          />
          <span className="text-sm" style={{ color: C.inkSoft }}>{t("dias")} {type === "after_completion" ? t("após concluir a tarefa") : t("de intervalo")}</span>
        </div>
      )}
    </div>
  );
}

function AttachmentEditor({ attachments, onChange, onOpen }) {
  const imgCam = useRef(null);
  const imgFile = useRef(null);
  const docFile = useRef(null);
  const [linkDraft, setLinkDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [showLink, setShowLink] = useState(false);
  const [showNote, setShowNote] = useState(false);

  const addFile = (file, kind) => {
    const reader = new FileReader();
    reader.onload = () => onChange([...attachments, { id: uid(), kind, name: file.name, mime: file.type, dataUrl: reader.result }]);
    reader.readAsDataURL(file);
  };
  const addLink = () => {
    if (!linkDraft.trim()) return;
    onChange([...attachments, { id: uid(), kind: "link", name: linkDraft.trim(), url: linkDraft.trim() }]);
    setLinkDraft(""); setShowLink(false);
  };
  const addNote = () => {
    if (!noteDraft.trim()) return;
    onChange([...attachments, { id: uid(), kind: "note", name: noteDraft.slice(0, 30) || "Nota", text: noteDraft.trim() }]);
    setNoteDraft(""); setShowNote(false);
  };
  const addLocation = () => {
    if (!navigator.geolocation) {
      const address = prompt("Geolocalização indisponível. Digite um endereço:");
      if (address) onChange([...attachments, { id: uid(), kind: "location", name: address, address }]);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange([...attachments, { id: uid(), kind: "location", name: "Localização atual", lat: pos.coords.latitude, lng: pos.coords.longitude }]),
      () => {
        const address = prompt("Não foi possível obter sua localização. Digite um endereço:");
        if (address) onChange([...attachments, { id: uid(), kind: "location", name: address, address }]);
      }
    );
  };
  const remove = (id) => onChange(attachments.filter((a) => a.id !== id));
  const ICONS = { image: ImageIcon, file: FileText, link: Link2, note: StickyNote, location: MapPin };
  const btnStyle = { borderColor: C.border, color: C.ink };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => imgCam.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium" style={btnStyle}><Camera size={14} /> {t("Foto")}</button>
        <button type="button" onClick={() => imgFile.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium" style={btnStyle}><ImageIcon size={14} /> {t("Imagem")}</button>
        <button type="button" onClick={() => docFile.current?.click()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium" style={btnStyle}><FileText size={14} /> {t("PDF/Documento")}</button>
        <button type="button" onClick={() => setShowLink((v) => !v)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium" style={btnStyle}><Link2 size={14} /> {t("Link")}</button>
        <button type="button" onClick={() => setShowNote((v) => !v)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium" style={btnStyle}><StickyNote size={14} /> {t("Nota")}</button>
        <button type="button" onClick={addLocation} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium" style={btnStyle}><MapPin size={14} /> {t("Localização")}</button>
        <input ref={imgCam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(f, "image"); e.target.value = ""; }} />
        <input ref={imgFile} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(f, "image"); e.target.value = ""; }} />
        <input ref={docFile} type="file" accept=".pdf,.doc,.docx,.txt,.xls,.xlsx,.ppt,.pptx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(f, "file"); e.target.value = ""; }} />
      </div>
      {showLink && (
        <div className="flex gap-2 mt-2">
          <input value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder={t("https://...")} className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: C.border, color: C.ink }} />
          <button type="button" onClick={addLink} className="px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: C.primary }}>{t("Adicionar")}</button>
        </div>
      )}
      {showNote && (
        <div className="flex gap-2 mt-2">
          <input value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} placeholder={t("Escreva a nota...")} className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: C.border, color: C.ink }} />
          <button type="button" onClick={addNote} className="px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: C.primary }}>{t("Adicionar")}</button>
        </div>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2.5">
          {attachments.map((a) => {
            const Icon = ICONS[a.kind] || Paperclip;
            return (
              <div key={a.id} className="inline-flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-xs" style={{ background: C.surfaceSunk }}>
                <button type="button" onClick={() => onOpen?.(a)} className="inline-flex items-center gap-1 font-medium" style={{ color: C.ink }}>
                  <Icon size={12} /> <span className="max-w-[110px] truncate">{a.name}</span>
                </button>
                <button type="button" onClick={() => remove(a.id)} style={{ color: C.danger }}><X size={12} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CommentsEditor({ comments, onChange }) {
  const [author, setAuthor] = useState("Você");
  const [text, setText] = useState("");
  const add = () => {
    if (!text.trim()) return;
    onChange([...comments, { id: uid(), author: author.trim() || "Você", text: text.trim(), createdAt: new Date().toISOString() }]);
    setText("");
  };
  return (
    <div>
      {comments.length > 0 && (
        <div className="space-y-2 mb-2 max-h-40 overflow-y-auto pr-1">
          {comments.map((c) => (
            <div key={c.id} className="text-sm rounded-lg px-3 py-2" style={{ background: C.surfaceSunk }}>
              <span className="font-semibold" style={{ color: C.ink }}>{c.author}</span>
              <span className="ml-1" style={{ color: C.inkSoft }}>— {c.text}</span>
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input value={author} onChange={(e) => setAuthor(e.target.value)} className="w-24 px-2 py-2 rounded-lg border text-xs outline-none" style={{ borderColor: C.border, color: C.ink }} placeholder={t("Nome")} />
        <input
          value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          className="flex-1 px-3 py-2 rounded-lg border text-sm outline-none" style={{ borderColor: C.border, color: C.ink }}
          placeholder={t("Escrever um comentário...")}
        />
        <button type="button" onClick={add} className="px-3 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: C.primary }}>{t("Enviar")}</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Install banner (PWA — Adicionar à tela inicial do celular)         */
/* ------------------------------------------------------------------ */
function InstallBanner({ variant, onInstall, onDismiss }) {
  if (!variant) return null;
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3">
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: C.primarySoft, border: `1px solid ${C.primary}` }}>
        <Smartphone size={18} color={C.primary} className="flex-shrink-0" />
        <div className="flex-1 text-sm" style={{ color: C.ink }}>
          {variant === "android"
            ? t("Instale o Vivaro na tela inicial do seu celular para usar como um app e receber os lembretes em formato de notificação.")
            : t("Para instalar o Vivaro no iPhone: toque no ícone de Compartilhar do Safari e depois em \"Adicionar à Tela de Início\".")}
        </div>
        {variant === "android" && (
          <button onClick={onInstall} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0" style={{ background: C.primary }}>{t("Instalar")}</button>
        )}
        <button onClick={onDismiss} className="flex-shrink-0" style={{ color: C.inkSoft }}><X size={16} /></button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reminder notifications: permission banner + in-app toasts          */
/* ------------------------------------------------------------------ */
function NotificationBanner({ permission, onEnable, onDismiss }) {
  if (permission === "granted" || permission === "unsupported") return null;
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3">
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: C.accentSoft, border: `1px solid ${C.accent}` }}>
        <BellRing size={18} color={C.accent} className="flex-shrink-0" />
        <div className="flex-1 text-sm" style={{ color: C.ink }}>
          {permission === "denied"
            ? t("As notificações estão bloqueadas nas configurações do navegador. Ative-as manualmente para receber os lembretes.")
            : t("Ative as notificações para receber avisos dos lembretes que você configurar nas tarefas.")}
        </div>
        {permission === "default" && (
          <button onClick={onEnable} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0" style={{ background: C.accent }}>{t("Ativar")}</button>
        )}
        <button onClick={onDismiss} className="flex-shrink-0" style={{ color: C.inkSoft }}><X size={16} /></button>
      </div>
    </div>
  );
}

function ReminderToasts({ toasts, onDismiss, onExport }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed bottom-20 right-4 left-4 sm:left-auto z-[80] flex flex-col gap-2 sm:w-80">
      {toasts.map((tk) => (
        <div key={tk.id} className="rounded-xl p-3.5 shadow-lg flex items-start gap-2.5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <BellRing size={16} color={C.accent} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold" style={{ color: C.ink }}>{t("Lembrete:")} {tk.task.title}</div>
            <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>
              {t("Prazo")} {fmtDate(tk.task.dueAt)}{fmtTime(tk.task.dueAt) ? ` · ${fmtTime(tk.task.dueAt)}` : ""}
            </div>
            <button onClick={() => onExport(tk.task)} className="text-xs font-semibold mt-1.5" style={{ color: C.primary }}>{t("Ver na Google Agenda")}</button>
          </div>
          <button onClick={() => onDismiss(tk.id)} style={{ color: C.inkSoft }}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Módulos (menu fixo no rodapé) e módulo Saúde → Hidratação          */
/* ------------------------------------------------------------------ */
const MODULES = [
  { id: "tarefas", get label() { return t("Tarefas"); }, icon: LayoutDashboard },
  { id: "saude", get label() { return t("Saúde"); }, icon: HeartPulse },
  // Novos módulos: basta acrescentar uma linha aqui e tratar o id no App.
];

function BottomNav({ module, onChange }) {
  return (
    <nav aria-label={t("Módulos")} className="fixed bottom-0 inset-x-0 z-[60]" style={{ background: C.surface, borderTop: `1px solid ${C.border}`, paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex gap-1.5 overflow-x-auto px-3 py-2 max-w-6xl mx-auto" style={{ scrollbarWidth: "none" }}>
        {MODULES.map((m) => {
          const active = module === m.id;
          return (
            <button
              key={m.id} onClick={() => onChange(m.id)}
              className="flex-shrink-0 min-w-[92px] flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-xl text-[11px] font-semibold"
              style={{ background: active ? C.primarySoft : "transparent", color: active ? C.primary : C.inkSoft }}
            >
              <m.icon size={20} />
              {m.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

const HEALTH_KEY = "vivaro:health:v1";
const DEFAULT_HYDRATION = { goalMl: 2000, intervalMin: 120, start: "08:00", end: "22:00", remindersOn: true, days: [0, 1, 2, 3, 4, 5, 6], amounts: [200, 300, 400], log: [] };

function loadHealth() {
  try {
    const raw = localStorage.getItem(HEALTH_KEY);
    if (raw) {
      const h = JSON.parse(raw);
      const hy = { ...DEFAULT_HYDRATION, ...(h.hydration || {}) };
      if (!Array.isArray(hy.log)) hy.log = [];
      if (!Array.isArray(hy.days)) hy.days = [...DEFAULT_HYDRATION.days];
      if (!Array.isArray(hy.amounts) || hy.amounts.length !== 3) hy.amounts = [...DEFAULT_HYDRATION.amounts];
      return { hydration: hy };
    }
  } catch (e) { /* ignore */ }
  return { hydration: { ...DEFAULT_HYDRATION, amounts: [...DEFAULT_HYDRATION.amounts], log: [] } };
}

const pad2 = (n) => String(n).padStart(2, "0");
const dayKey = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const totalForDay = (log, d) => log.reduce((sum, e) => (dayKey(new Date(e.at)) === dayKey(d) ? sum + (Number(e.ml) || 0) : sum), 0);

// Horários dos lembretes de água para `days` dias a partir de hoje
function hydrationSlots(hy, days) {
  const out = [];
  const [sh, sm] = (hy.start || "08:00").split(":").map(Number);
  const [eh, em] = (hy.end || "22:00").split(":").map(Number);
  const startMin = (sh || 0) * 60 + (sm || 0);
  const endMin = (eh || 0) * 60 + (em || 0);
  const step = Math.max(15, Number(hy.intervalMin) || 120);
  for (let i = 0; i < days; i++) {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + i);
    if (Array.isArray(hy.days) && !hy.days.includes(base.getDay())) continue;
    for (let m = startMin; m <= endMin; m += step) {
      const d = new Date(base);
      d.setHours(0, m, 0, 0);
      out.push(d);
    }
  }
  return out;
}

const INTERVAL_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240];
const intervalLabel = (m) => {
  if (m < 60) return t("A cada {n} min", { n: m });
  const h = Math.floor(m / 60), r = m % 60;
  return t("A cada {h}", { h: r ? `${h} h ${r}` : `${h} h` });
};

function HealthView({ health, onChange, onAdd, onRemove, onTest }) {
  const [sub, setSub] = useState(null);
  const hy = health.hydration;
  const today = totalForDay(hy.log, new Date());
  if (sub === "hidratacao") return <HydrationView hy={hy} onChange={onChange} onAdd={onAdd} onRemove={onRemove} onTest={onTest} onBack={() => setSub(null)} />;
  const pct = Math.min(100, Math.round((today / Math.max(1, hy.goalMl)) * 100));
  return (
    <div className="max-w-xl space-y-4">
      <h2 className="font-bold text-lg inline-flex items-center gap-2" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}><HeartPulse size={20} color={C.accent} /> {t("Módulos de saúde")}</h2>
      <button onClick={() => setSub("hidratacao")} className="w-full text-left rounded-2xl p-4 flex items-center gap-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0" style={{ background: C.primarySoft }}><Droplets size={24} color={C.primary} /></div>
        <div className="flex-1 min-w-0">
          <div className="font-bold" style={{ color: C.ink }}>{t("Hidratação")}</div>
          <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{t("Meta diária de água e lembretes para beber")}</div>
          <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: C.surfaceSunk }}><div className="h-full rounded-full" style={{ width: `${pct}%`, background: C.primary }} /></div>
          <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{today} / {hy.goalMl} ml</div>
        </div>
        <ChevronRight size={18} style={{ color: C.inkSoft }} />
      </button>
      <div className="text-xs text-center py-3 rounded-2xl" style={{ color: C.inkSoft, border: `1px dashed ${C.border}` }}>{t("Mais módulos de saúde em breve")}</div>
    </div>
  );
}

function HydrationView({ hy, onChange, onAdd, onRemove, onTest, onBack }) {
  const [custom, setCustom] = useState("");
  const now = new Date();
  const total = totalForDay(hy.log, now);
  const goal = Math.max(1, hy.goalMl);
  const pct = Math.min(100, Math.round((total / goal) * 100));
  const left = Math.max(0, goal - total);
  const R = 62, CIRC = 2 * Math.PI * R;
  const todayLog = hy.log.filter((e) => dayKey(new Date(e.at)) === dayKey(now)).sort((a, b) => new Date(b.at) - new Date(a.at));
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    return { d, total: totalForDay(hy.log, d) };
  });
  const maxBar = Math.max(goal, ...week.map((w) => w.total));
  const card = { background: C.surface, border: `1px solid ${C.border}` };
  const input = "px-2.5 py-2 rounded-lg border text-sm outline-none";
  const num = (v, min, max, fb) => Math.min(max, Math.max(min, parseInt(v, 10) || fb));

  return (
    <div className="max-w-xl space-y-4">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: C.primary }}><ChevronLeft size={16} /> {t("Voltar")}</button>
      <h2 className="font-bold text-lg inline-flex items-center gap-2" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}><Droplets size={20} color={C.primary} /> {t("Hidratação")}</h2>

      <div className="rounded-2xl p-5 flex flex-col items-center" style={card}>
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>{t("Hoje")}</div>
        <div className="relative" style={{ width: 160, height: 160 }}>
          <svg width="160" height="160" viewBox="0 0 160 160" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="80" cy="80" r={R} fill="none" stroke="var(--v-surfaceSunk)" strokeWidth="14" />
            <circle cx="80" cy="80" r={R} fill="none" stroke="var(--v-primary)" strokeWidth="14" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct / 100)} style={{ transition: "stroke-dashoffset .4s" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-2xl font-bold" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{pct}%</div>
            <div className="text-xs" style={{ color: C.inkSoft }}>{total} / {hy.goalMl} ml</div>
          </div>
        </div>
        <div className="text-sm font-semibold mt-3" style={{ color: left === 0 ? C.primary : C.ink }}>
          {left === 0 ? t("Meta atingida! 🎉") : t("Faltam {n} ml para a meta", { n: left })}
        </div>
      </div>

      <div className="rounded-2xl p-5" style={card}>
        <div className="text-sm font-bold mb-2" style={{ color: C.ink }}>{t("Quanto bebeu?")}</div>
        <div className="grid grid-cols-3 gap-2">
          {hy.amounts.map((ml, i) => (
            <button key={i} onClick={() => onAdd(ml)} className="py-3 rounded-xl font-bold text-sm" style={{ background: C.primarySoft, color: C.primary }}>+{ml} ml</button>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <input type="number" min={1} value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t("Outra quantidade (ml)")} className={`${input} flex-1`} style={{ borderColor: C.border, color: C.ink }} />
          <button onClick={() => { const ml = parseInt(custom, 10); if (ml > 0) { onAdd(Math.min(ml, 5000)); setCustom(""); } }} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: C.accent }}>{t("Adicionar")}</button>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={card}>
        <div className="text-sm font-bold mb-2" style={{ color: C.ink }}>{t("Registos de hoje")}</div>
        {todayLog.length === 0 && <div className="text-xs" style={{ color: C.inkSoft }}>{t("Ainda sem registos hoje.")}</div>}
        <div className="space-y-1.5">
          {todayLog.map((e) => (
            <div key={e.id} className="flex items-center gap-2 text-sm" style={{ color: C.ink }}>
              <Droplets size={14} color={C.primary} />
              <span className="font-semibold">{e.ml} ml</span>
              <span className="text-xs flex-1" style={{ color: C.inkSoft }}>{new Date(e.at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}</span>
              <button onClick={() => onRemove(e.id)} title={t("Remover")} className="p-1" style={{ color: C.danger }}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-5" style={card}>
        <div className="text-sm font-bold mb-3" style={{ color: C.ink }}>{t("Últimos 7 dias")}</div>
        <div className="flex items-end gap-2" style={{ height: 110 }}>
          {week.map((w, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
              <div className="w-full rounded-t-md" title={`${w.total} ml`} style={{ height: `${Math.max(3, (w.total / maxBar) * 84)}px`, background: w.total >= goal ? C.primary : C.primarySoft }} />
              <div className="text-[10px]" style={{ color: C.inkSoft }}>{w.d.toLocaleDateString(locale(), { weekday: "narrow" })}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl p-5 space-y-4" style={card}>
        <div className="text-sm font-bold" style={{ color: C.ink }}>{t("Configuração")}</div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Meta diária (ml)")}</label>
          <input type="number" min={500} max={10000} step={100} value={hy.goalMl} onChange={(e) => onChange({ goalMl: num(e.target.value, 100, 10000, 2000) })} className={`${input} w-full mt-1.5`} style={{ borderColor: C.border, color: C.ink }} />
        </div>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Quantidades rápidas (ml)")}</label>
          <div className="grid grid-cols-3 gap-2 mt-1.5">
            {hy.amounts.map((ml, i) => (
              <input key={i} type="number" min={50} max={2000} step={50} value={ml} onChange={(e) => { const a = [...hy.amounts]; a[i] = num(e.target.value, 50, 2000, DEFAULT_HYDRATION.amounts[i]); onChange({ amounts: a }); }} className={input} style={{ borderColor: C.border, color: C.ink }} />
            ))}
          </div>
          <div className="text-xs mt-1.5" style={{ color: C.inkSoft }}>{t("Estas 3 quantidades aparecem como botões em cada lembrete.")}</div>
        </div>
      </div>

      <div className="rounded-2xl p-5 space-y-4" style={card}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-bold inline-flex items-center gap-1.5" style={{ color: C.ink }}><BellRing size={15} color={C.accent} /> {t("Ativar lembretes de hidratação")}</div>
            <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{hy.remindersOn ? t("Cada lembrete mostra uma curiosidade sobre hidratação.") : t("Lembretes desligados. Ligue para receber avisos nos dias e horas escolhidos.")}</div>
          </div>
          <button onClick={() => onChange({ remindersOn: !hy.remindersOn })} role="switch" aria-checked={hy.remindersOn} className="flex-shrink-0 w-12 h-7 rounded-full relative transition-colors" style={{ background: hy.remindersOn ? C.primary : C.border }}>
            <span className="absolute top-0.5 w-6 h-6 rounded-full bg-white transition-all" style={{ left: hy.remindersOn ? 22 : 2 }} />
          </button>
        </div>

        <div style={{ opacity: hy.remindersOn ? 1 : 0.45, pointerEvents: hy.remindersOn ? "auto" : "none" }} className="space-y-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Dias dos lembretes")}</label>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {weekdayShort().map((lbl, d) => {
                const on = hy.days.includes(d);
                return (
                  <button key={d} onClick={() => onChange({ days: on ? hy.days.filter((x) => x !== d) : [...hy.days, d].sort() })} className="px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize" style={{ background: on ? C.primary : C.surfaceSunk, color: on ? "#fff" : C.inkSoft }}>{lbl}</button>
                );
              })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Início dos alertas")}</label>
              <input type="time" value={hy.start} onChange={(e) => onChange({ start: e.target.value || "08:00" })} className={`${input} w-full mt-1.5`} style={{ borderColor: C.border, color: C.ink }} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Fim dos alertas")}</label>
              <input type="time" value={hy.end} onChange={(e) => onChange({ end: e.target.value || "22:00" })} className={`${input} w-full mt-1.5`} style={{ borderColor: C.border, color: C.ink }} />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Frequência do lembrete")}</label>
            <select value={hy.intervalMin} onChange={(e) => onChange({ intervalMin: parseInt(e.target.value, 10) })} className={`${input} w-full mt-1.5`} style={{ borderColor: C.border, color: C.ink }}>
              {[...new Set([...INTERVAL_OPTIONS, hy.intervalMin])].sort((a, b) => a - b).map((m) => <option key={m} value={m}>{intervalLabel(m)}</option>)}
            </select>
          </div>
          {onTest && (
            <button onClick={onTest} className="w-full px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: C.primarySoft, color: C.primary }}>{t("Notificação de teste (5 s)")}</button>
          )}
        </div>
      </div>
    </div>
  );
}

// Cartão de lembrete de água dentro da app (versão web): escolhe-se logo quanto bebeu
function WaterPrompt({ tip, amounts, onPick, onLater }) {
  return (
    <div className="fixed left-4 right-4 sm:left-auto sm:w-80 bottom-20 z-[80] rounded-2xl p-4 shadow-lg" style={{ background: C.surface, border: `1px solid ${C.primary}` }}>
      <div className="font-bold text-sm inline-flex items-center gap-1.5" style={{ color: C.ink }}><Droplets size={16} color={C.primary} /> {t("Hora de beber água 💧")}</div>
      {tip && <div className="text-xs mt-1.5" style={{ color: C.ink }}>💡 {tip}</div>}
      <div className="text-xs mt-1.5 mb-2.5" style={{ color: C.inkSoft }}>{t("Quanto bebeu? Toque numa quantidade para registar.")}</div>
      <div className="grid grid-cols-3 gap-2">
        {amounts.map((ml, i) => (
          <button key={i} onClick={() => onPick(ml)} className="py-2 rounded-lg font-bold text-sm" style={{ background: C.primarySoft, color: C.primary }}>{ml} ml</button>
        ))}
      </div>
      <button onClick={onLater} className="w-full text-xs font-semibold mt-2.5" style={{ color: C.inkSoft }}>{t("Mais tarde")}</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Android (APK): definições nativas de lembretes e despertador       */
/* ------------------------------------------------------------------ */
function StatusRow({ ok, title, hint, actionLabel, onAction }) {
  return (
    <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: C.surfaceSunk }}>
      <div className="mt-0.5 flex-shrink-0" style={{ color: ok ? C.primary : C.danger }}>{ok ? <Check size={18} /> : <AlertTriangle size={18} />}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold" style={{ color: C.ink }}>{title}</div>
        <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{hint}</div>
      </div>
      {!ok && onAction && (
        <button onClick={onAction} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0" style={{ background: C.accent }}>{actionLabel}</button>
      )}
    </div>
  );
}

function SettingsModal({ status, onRefresh, onClose, lang, onLang }) {
  const [msg, setMsg] = useState("");
  const toggleKeepAlive = async () => {
    await nativeSetKeepAlive(!status.keepAlive);
    onRefresh();
  };
  const runTest = async (alarm) => {
    await nativeTest(alarm);
    setMsg(t("{kind} de teste em 5 segundos. Pode até bloquear o ecrã ou sair da app.", { kind: t(alarm ? "Despertador" : "Notificação").toLowerCase() }));
  };
  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(28,31,36,0.5)" }} onClick={onClose}>
      <div className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl" style={{ background: C.surface }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 sticky top-0" style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <span className="font-bold text-lg inline-flex items-center gap-1.5" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}><Settings size={17} color={C.accent} /> {t("Definições")}</span>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-60" style={{ color: C.inkSoft }}><X size={20} /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: C.inkSoft }}><Globe size={13} /> {t("Idioma")}</div>
            <p className="text-xs mt-1 mb-2" style={{ color: C.inkSoft }}>{t("Escolha o idioma da aplicação. O assistente de IA também passa a responder nesse idioma.")}</p>
            <div className="grid grid-cols-2 gap-2">
              {LANGS.map((l) => (
                <button key={l.code} onClick={() => onLang(l.code)} className="px-3 py-2 rounded-xl text-sm font-semibold text-left inline-flex items-center justify-between gap-2"
                  style={{ background: lang === l.code ? C.primarySoft : C.surfaceSunk, color: lang === l.code ? C.primary : C.ink, border: `1px solid ${lang === l.code ? C.primary : "transparent"}` }}>
                  <span>{l.name}</span>{lang === l.code && <Check size={15} />}
                </button>
              ))}
            </div>
          </div>

          {isNative && (
            <div className="space-y-3 pt-3" style={{ borderTop: `1px solid ${C.border}` }}>
              <div className="text-xs font-semibold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: C.inkSoft }}><ShieldCheck size={13} /> {t("Lembretes e alarmes")}</div>
              <p className="text-xs" style={{ color: C.inkSoft }}>
                {t("Para os lembretes chegarem sempre à hora certa, mesmo com o Vivaro fechado ou o ecrã bloqueado, confirme os pontos abaixo.")}
              </p>
              <StatusRow
                ok={status.notifications} title={t("Notificações")}
                hint={status.notifications ? t("Permitidas.") : t("Sem esta permissão não aparece nenhum lembrete.")}
                actionLabel={t("Permitir")} onAction={async () => { await nativeRequestNotifications(); setTimeout(async () => { const st = await nativeStatus(); if (!st.notifications) await nativeOpenNotificationSettings(); onRefresh(); }, 1500); }}
              />
              <StatusRow
                ok={status.exactAlarms} title={t("Alarmes e lembretes exatos")}
                hint={status.exactAlarms ? t("Permitidos: os avisos disparam à hora marcada.") : t("Sem isto o Android pode atrasar os avisos alguns minutos.")}
                actionLabel={t("Permitir")} onAction={async () => { await nativeOpenExactAlarmSettings(); }}
              />
              <StatusRow
                ok={status.batteryExempt} title={t("Sem restrições de bateria")}
                hint={status.batteryExempt ? t("O Android não vai parar o Vivaro para poupar bateria.") : t("Recomendado: evita que o Android pare o Vivaro em segundo plano.")}
                actionLabel={t("Permitir")} onAction={async () => { await nativeRequestBatteryExemption(); }}
              />
              <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: C.surfaceSunk }}>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold" style={{ color: C.ink }}>{t("Manter o Vivaro ativo em segundo plano")}</div>
                  <div className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{t("Mostra uma notificação discreta permanente e ajuda a entregar os lembretes.")}</div>
                </div>
                <button onClick={toggleKeepAlive} className="px-3 py-1.5 rounded-lg text-xs font-semibold flex-shrink-0" style={{ background: status.keepAlive ? C.primary : C.border, color: status.keepAlive ? "#fff" : C.ink }}>
                  {status.keepAlive ? t("Ligado") : t("Desligado")}
                </button>
              </div>

              <div className="pt-1">
                <div className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: C.inkSoft }}>{t("Testar")}</div>
                <div className="flex gap-2">
                  <button onClick={() => runTest(false)} className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: C.primarySoft, color: C.primary }}>{t("Notificação")}</button>
                  <button onClick={() => runTest(true)} className="flex-1 px-3 py-2 rounded-xl text-sm font-semibold" style={{ background: C.accentSoft, color: C.accent }}>{t("Despertador")}</button>
                </div>
                {msg && <div className="text-xs mt-2" style={{ color: C.inkSoft }}>{msg}</div>}
              </div>

              <p className="text-xs pt-1" style={{ color: C.inkSoft }}>
                {t("Nas notificações pode tocar em Adiar 10 min, Adiar 1 h ou Concluir sem abrir a app. Em cada tarefa pode ainda ativar a opção Despertador.")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NativeSetupBanner({ status, onOpen }) {
  const missing = !status.notifications || !status.exactAlarms || !status.batteryExempt;
  if (!missing) return null;
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-3">
      <div className="flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: C.accentSoft, border: `1px solid ${C.accent}` }}>
        <BellRing size={18} color={C.accent} className="flex-shrink-0" />
        <div className="flex-1 text-sm" style={{ color: C.ink }}>{t("Falta ativar permissões para os lembretes funcionarem sempre à hora certa.")}</div>
        <button onClick={onOpen} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex-shrink-0" style={{ background: C.accent }}>{t("Configurar")}</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Theme toggle switch                                                */
/* ------------------------------------------------------------------ */
function ThemeToggle({ theme, onToggle }) {
  const dark = theme === "dark";
  return (
    <button
      onClick={onToggle}
      title={dark ? t("Mudar para tema claro") : t("Mudar para tema escuro")}
      aria-label={dark ? t("Mudar para tema claro") : t("Mudar para tema escuro")}
      className="relative inline-flex items-center w-12 h-7 rounded-full flex-shrink-0 transition-colors"
      style={{ background: C.surfaceSunk, border: `1px solid ${C.border}` }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-transform"
        style={{ background: C.surface, transform: dark ? "translateX(20px)" : "translateX(0)", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
      >
        {dark ? <Moon size={11} color={C.primary} /> : <Sun size={11} color={C.accent} />}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Voice capture button                                               */
/* ------------------------------------------------------------------ */
// Voz no APK Android: usa o reconhecimento de voz nativo (o WebView não tem Web Speech API)
async function listenNative(onText, setListening) {
  setListening(true);
  try {
    const text = await nativeListen(voiceLang());
    if (text) onText(text);
  } catch (e) {
    alert((e && e.message) || "Não foi possível usar o microfone.");
  } finally {
    setListening(false);
  }
}

function VoiceCaptureButton({ onResult }) {
  const [listening, setListening] = useState(false);
  const start = () => {
    if (isNative) { listenNative(onResult, setListening); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert(t("Reconhecimento de voz não é suportado neste navegador. Tente pelo Google Chrome.")); return; }
    const rec = new SR();
    rec.lang = voiceLang();
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => onResult(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  };
  return (
    <button
      onClick={start} title={t("Criar tarefa por voz")}
      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-sm"
      style={{ background: listening ? C.accent : C.surfaceSunk, color: listening ? "#fff" : C.ink }}
    >
      <Mic size={16} /> <span className="hidden sm:inline">{listening ? t("Ouvindo...") : t("Voz")}</span>
    </button>
  );
}

// Compact mic icon used to dictate text into a specific field (e.g. description)
function DictateFieldButton({ onText, title = "Ditar por voz" }) {
  const [listening, setListening] = useState(false);
  const start = () => {
    if (isNative) { listenNative(onText, setListening); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert(t("Reconhecimento de voz não é suportado neste navegador. Tente pelo Google Chrome.")); return; }
    const rec = new SR();
    rec.lang = voiceLang();
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => onText(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.start();
    setListening(true);
  };
  return (
    <button
      type="button" onClick={start} title={title}
      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold flex-shrink-0"
      style={{ background: listening ? C.accent : C.surfaceSunk, color: listening ? "#fff" : C.inkSoft }}
    >
      <Mic size={12} /> {listening ? t("Ouvindo...") : t("Ditar")}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Task Form Modal                                                    */
/* ------------------------------------------------------------------ */
function TaskModal({ initial, voicePrefill, onSave, onClose, onOpenAttachment }) {
  const blank = {
    id: null, title: "", description: "", category: "pessoal",
    quadrant: 2, status: "pendente", dueDate: "", dueTime: "",
    reminders: [], attachments: [], subtasks: [], assignee: "", watchers: [], comments: [], recurrence: null, alarmMode: false, clockAlarm: false,
  };
  const [form, setForm] = useState(() => {
    if (!initial) return { ...blank, ...(voicePrefill || {}) };
    const dueAt = initial.dueAt ? new Date(initial.dueAt) : null;
    return {
      ...blank,
      ...initial,
      dueDate: dueAt ? dueAt.toISOString().slice(0, 10) : "",
      dueTime: dueAt && (dueAt.getHours() || dueAt.getMinutes()) ? dueAt.toTimeString().slice(0, 5) : "",
    };
  });

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addReminder = () => update("reminders", [...form.reminders, { id: uid(), value: 1, unit: "hours" }]);
  const updateReminder = (id, patch) => update("reminders", form.reminders.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const removeReminder = (id) => update("reminders", form.reminders.filter((r) => r.id !== id));

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    let dueAt = null;
    if (form.dueDate) dueAt = new Date(`${form.dueDate}T${form.dueTime || "00:00"}:00`).toISOString();
    onSave({
      id: form.id || uid(),
      title: form.title.trim(),
      description: form.description,
      category: form.category,
      quadrant: form.quadrant,
      status: form.status,
      dueAt,
      reminders: form.reminders,
      attachments: form.attachments,
      subtasks: form.subtasks,
      assignee: form.assignee,
      watchers: form.watchers,
      comments: form.comments,
      recurrence: form.recurrence,
      alarmMode: !!form.alarmMode,
      clockAlarm: !!form.clockAlarm,
      completedAt: form.status === "concluido" ? (form.completedAt || new Date().toISOString()) : null,
      createdAt: form.createdAt || new Date().toISOString(),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" style={{ background: "rgba(28,31,36,0.5)" }}>
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl" style={{ background: C.surface }}>
        <div className="flex items-center justify-between px-5 py-4 sticky top-0 z-10" style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
          <h2 className="font-bold text-lg" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{initial ? t("Editar tarefa") : t("Nova tarefa")}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-60" style={{ color: C.inkSoft }}><X size={20} /></button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Título")}</label>
            <input autoFocus value={form.title} onChange={(e) => update("title", e.target.value)} placeholder={t("Ex: Finalizar relatório mensal")}
              className="w-full mt-1.5 px-3 py-2.5 rounded-xl outline-none border text-[15px]" style={{ borderColor: C.border, color: C.ink }} />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Descrição")}</label>
              <DictateFieldButton
                title={t("Ditar descrição por voz")}
                onText={(transcript) => update("description", form.description ? `${form.description} ${transcript}` : transcript)}
              />
            </div>
            <textarea value={form.description} onChange={(e) => update("description", e.target.value)} placeholder={t("Detalhes da tarefa (opcional) — ou toque em Ditar e fale")} rows={2}
              className="w-full mt-1.5 px-3 py-2.5 rounded-xl outline-none border text-sm resize-none" style={{ borderColor: C.border, color: C.ink }} />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Categoria")}</label>
            <div className="flex gap-2 mt-1.5">
              <Pill active={form.category === "pessoal"} onClick={() => update("category", "pessoal")} color={C.pessoal} softColor={C.pessoalSoft} icon={User}>{t("Pessoal")}</Pill>
              <Pill active={form.category === "profissional"} onClick={() => update("category", "profissional")} color={C.profissional} softColor={C.profissionalSoft} icon={Briefcase}>{t("Profissional")}</Pill>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Prioridade (matriz de Eisenhower)")}</label>
            <div className="grid grid-cols-2 gap-2 mt-1.5">
              {QUADRANTS.map((q) => (
                <button key={q.id} onClick={() => update("quadrant", q.id)} className="rounded-xl p-2.5 text-left border-2 transition-all" style={{ background: q.soft, borderColor: form.quadrant === q.id ? q.color : "transparent" }}>
                  <div className="text-sm font-bold" style={{ color: q.color }}>{q.label}</div>
                  <div className="text-[11px]" style={{ color: C.inkSoft }}>{q.sub}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Estado")}</label>
            <select value={form.status} onChange={(e) => update("status", e.target.value)} className="w-full mt-1.5 px-3 py-2.5 rounded-xl outline-none border text-sm font-medium" style={{ borderColor: C.border, color: C.ink }}>
              {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Prazo")}</label>
            <div className="flex gap-2 mt-1.5">
              <input type="date" value={form.dueDate} onChange={(e) => update("dueDate", e.target.value)} className="flex-1 px-3 py-2.5 rounded-xl outline-none border text-sm" style={{ borderColor: C.border, color: C.ink }} />
              <input type="time" value={form.dueTime} onChange={(e) => update("dueTime", e.target.value)} className="w-28 px-3 py-2.5 rounded-xl outline-none border text-sm" style={{ borderColor: C.border, color: C.ink }} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Recorrência")}</label>
            <div className="mt-1.5"><RecurrenceEditor recurrence={form.recurrence} onChange={(r) => update("recurrence", r)} /></div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Lembretes")}</label>
              <button onClick={addReminder} className="text-xs font-semibold inline-flex items-center gap-1" style={{ color: C.primary }}><Plus size={13} /> {t("Adicionar lembrete")}</button>
            </div>
            <div className="space-y-2 mt-1.5">
              {form.reminders.length === 0 && <div className="text-xs" style={{ color: C.inkSoft }}>{t("Nenhum lembrete configurado.")}</div>}
              {form.reminders.map((r) => (
                <div key={r.id} className="flex items-center gap-2">
                  <input type="number" min={1} value={r.value} onChange={(e) => updateReminder(r.id, { value: Math.max(1, parseInt(e.target.value) || 1) })} className="w-16 px-2 py-1.5 rounded-lg border text-sm outline-none" style={{ borderColor: C.border, color: C.ink }} />
                  <select value={r.unit} onChange={(e) => updateReminder(r.id, { unit: e.target.value })} className="px-2 py-1.5 rounded-lg border text-sm outline-none flex-1" style={{ borderColor: C.border, color: C.ink }}>
                    {REMINDER_UNITS.map((u) => <option key={u.id} value={u.id}>{u.label} {t("antes")}</option>)}
                  </select>
                  <button onClick={() => removeReminder(r.id)} className="p-1.5" style={{ color: C.danger }}><X size={15} /></button>
                </div>
              ))}
            </div>
          </div>

          {isNative && (
            <div className="rounded-xl p-3 space-y-2" style={{ background: C.surfaceSunk }}>
              <div className="text-xs font-semibold uppercase tracking-wide inline-flex items-center gap-1.5" style={{ color: C.inkSoft }}><AlarmClock size={13} /> {t("Despertador")}</div>
              <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: C.ink }}>
                <input type="checkbox" className="mt-0.5" checked={!!form.alarmMode} onChange={(e) => update("alarmMode", e.target.checked)} />
                <span>{t("Tocar como despertador (som de alarme, repete até dispensar) nos lembretes e no prazo desta tarefa")}</span>
              </label>
              <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: C.ink }}>
                <input type="checkbox" className="mt-0.5" checked={!!form.clockAlarm} onChange={(e) => update("clockAlarm", e.target.checked)} />
                <span>{t("Criar também um alarme na app Relógio do telemóvel à hora do prazo")} <span style={{ color: C.inkSoft }}>{t("(só quando faltarem menos de 24 h e com o Vivaro aberto)")}</span></span>
              </label>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Subtarefas")}</label>
            <div className="mt-1.5"><SubtaskEditor subtasks={form.subtasks} onChange={(s) => update("subtasks", s)} /></div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Responsável")}</label>
              <input value={form.assignee} onChange={(e) => update("assignee", e.target.value)} placeholder={t("Ex: João")} className="w-full mt-1.5 px-3 py-2.5 rounded-xl outline-none border text-sm" style={{ borderColor: C.border, color: C.ink }} />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Observadores")}</label>
              <div className="mt-1.5"><TagInput values={form.watchers} onChange={(w) => update("watchers", w)} placeholder={t("Adicionar observador")} /></div>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Anexos")}</label>
            <div className="mt-1.5"><AttachmentEditor attachments={form.attachments} onChange={(a) => update("attachments", a)} onOpen={onOpenAttachment} /></div>
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: C.inkSoft }}>{t("Comentários")}</label>
            <div className="mt-1.5"><CommentsEditor comments={form.comments} onChange={(c) => update("comments", c)} /></div>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 sticky bottom-0" style={{ background: C.surface, borderTop: `1px solid ${C.border}` }}>
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm border" style={{ borderColor: C.border, color: C.inkSoft }}>{t("Cancelar")}</button>
          <button onClick={handleSubmit} disabled={!form.title.trim()} className="flex-1 px-4 py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-40" style={{ background: C.primary }}>{t("Salvar tarefa")}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Filter Bar                                                         */
/* ------------------------------------------------------------------ */
function FilterBar({ filters, setFilters }) {
  const toggleStatus = (id) => setFilters((f) => ({ ...f, statuses: f.statuses.includes(id) ? f.statuses.filter((s) => s !== id) : [...f.statuses, id] }));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pill active={filters.category === "todas"} onClick={() => setFilters((f) => ({ ...f, category: "todas" }))} color={C.ink} softColor={C.surfaceSunk}>{t("Todas")}</Pill>
      <Pill active={filters.category === "pessoal"} onClick={() => setFilters((f) => ({ ...f, category: "pessoal" }))} color={C.pessoal} softColor={C.pessoalSoft} icon={User}>{t("Pessoal")}</Pill>
      <Pill active={filters.category === "profissional"} onClick={() => setFilters((f) => ({ ...f, category: "profissional" }))} color={C.profissional} softColor={C.profissionalSoft} icon={Briefcase}>{t("Profissional")}</Pill>

      <div className="w-px h-5 mx-1" style={{ background: C.border }} />
      {STATUSES.map((s) => (
        <Pill key={s.id} active={filters.statuses.includes(s.id)} onClick={() => toggleStatus(s.id)} color={s.color} softColor={C.surfaceSunk}>{s.label}</Pill>
      ))}

      <div className="w-px h-5 mx-1" style={{ background: C.border }} />
      <Pill active={filters.overdueOnly} onClick={() => setFilters((f) => ({ ...f, overdueOnly: !f.overdueOnly, onTimeOnly: false }))} color={C.danger} softColor={C.dangerSoft} icon={AlertTriangle}>{t("Em atraso")}</Pill>
      <Pill active={filters.onTimeOnly} onClick={() => setFilters((f) => ({ ...f, onTimeOnly: !f.onTimeOnly, overdueOnly: false }))} color={C.primary} softColor={C.primarySoft} icon={Clock}>{t("Dentro do prazo")}</Pill>

      <div className="w-px h-5 mx-1" style={{ background: C.border }} />
      <Pill active={filters.hideDone} onClick={() => setFilters((f) => ({ ...f, hideDone: !f.hideDone }))} color={C.ink} softColor={C.surfaceSunk} icon={filters.hideDone ? EyeOff : Eye}>
        {filters.hideDone ? t("Concluídas/canceladas ocultas") : t("Mostrar concluídas/canceladas")}
      </Pill>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Shared filter/sort helpers                                         */
/* ------------------------------------------------------------------ */
function applyFilters(tasks, filters, activeQuadrant) {
  return tasks.filter((t) => {
    if (filters.category !== "todas" && t.category !== filters.category) return false;
    if (filters.statuses.length > 0 && !filters.statuses.includes(t.status)) return false;
    if (filters.hideDone && (t.status === "concluido" || t.status === "cancelado")) return false;
    if (filters.overdueOnly && !isOverdue(t)) return false;
    if (filters.onTimeOnly && (isOverdue(t) || !t.dueAt || t.status === "concluido" || t.status === "cancelado")) return false;
    if (activeQuadrant && t.quadrant !== activeQuadrant) return false;
    return true;
  });
}

function sortByPriority(tasks) {
  return [...tasks].sort((a, b) => {
    if (a.quadrant !== b.quadrant) return a.quadrant - b.quadrant;
    const ad = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
    const bd = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
    return ad - bd;
  });
}

function EmptyState() {
  return (
    <div className="text-center py-16 rounded-2xl" style={{ background: C.surface, border: `1px dashed ${C.border}` }}>
      <div className="text-sm font-semibold" style={{ color: C.ink }}>{t("Nenhuma tarefa por aqui")}</div>
      <div className="text-sm mt-1" style={{ color: C.inkSoft }}>{t("Ajuste os filtros ou crie uma nova tarefa para começar.")}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Views                                                               */
/* ------------------------------------------------------------------ */
function DashboardView({ tasks, filters, setFilters, activeQuadrant, setActiveQuadrant, ...cardHandlers }) {
  const filtered = useMemo(() => sortByPriority(applyFilters(tasks, filters, activeQuadrant)), [tasks, filters, activeQuadrant]);
  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row gap-5 lg:items-start">
        <div className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>{t("Matriz de Eisenhower")}</div>
          <EisenhowerWidget tasks={tasks} activeQuadrant={activeQuadrant} onSelect={setActiveQuadrant} />
        </div>
        <div className="flex-1 rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>{t("Filtros")}</div>
          <FilterBar filters={filters} setFilters={setFilters} />
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2" style={{ color: C.inkSoft }}>{filtered.length} {filtered.length === 1 ? t("tarefa") : t("tarefas")} {t("· ordenadas por prioridade")}</div>
        {filtered.length === 0 ? <EmptyState /> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((t) => <TaskCard key={t.id} task={t} {...cardHandlers} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanView({ tasks, filters, setFilters, activeQuadrant, setActiveQuadrant, ...cardHandlers }) {
  const filtered = useMemo(() => sortByPriority(applyFilters(tasks, filters, activeQuadrant)), [tasks, filters, activeQuadrant]);
  const visibleStatuses = filters.hideDone ? STATUSES.filter((s) => s.id !== "concluido" && s.id !== "cancelado") : STATUSES;
  const dragId = useRef(null);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}><FilterBar filters={filters} setFilters={setFilters} /></div>
      <div className="flex gap-4 overflow-x-auto pb-3">
        {visibleStatuses.map((s) => {
          const col = filtered.filter((t) => t.status === s.id);
          return (
            <div key={s.id} className="flex-shrink-0 w-72 rounded-2xl p-3" style={{ background: C.surfaceSunk }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId.current) cardHandlers.onStatusChange(dragId.current, s.id); dragId.current = null; }}>
              <div className="flex items-center justify-between px-1 mb-3">
                <span className="text-sm font-bold" style={{ color: s.color }}>{s.label}</span>
                <span className="text-xs font-mono font-bold px-1.5 py-0.5 rounded-md" style={{ color: s.color, background: C.surface, fontFamily: "'IBM Plex Mono', monospace" }}>{col.length}</span>
              </div>
              <div className="space-y-2.5 min-h-[60px]">
                {col.map((t) => <TaskCard key={t.id} task={t} draggable onDragStart={() => { dragId.current = t.id; }} {...cardHandlers} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListView({ tasks, filters, setFilters, activeQuadrant, ...cardHandlers }) {
  const filtered = useMemo(() => sortByPriority(applyFilters(tasks, filters, activeQuadrant)), [tasks, filters, activeQuadrant]);
  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}><FilterBar filters={filters} setFilters={setFilters} /></div>
      {filtered.length === 0 ? <EmptyState /> : (
        <div className="rounded-2xl overflow-hidden" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
          {filtered.map((tk, i) => {
            const q = QUADRANTS.find((x) => x.id === tk.quadrant) || QUADRANTS[3];
            const st = STATUSES.find((s) => s.id === tk.status) || STATUSES[0];
            const overdue = isOverdue(tk);
            const subtasks = tk.subtasks || [];
            const done = subtasks.filter((s) => s.done).length;
            return (
              <div key={tk.id} className="flex items-center gap-3 px-4 py-3 flex-wrap sm:flex-nowrap" style={{ borderTop: i > 0 ? `1px solid ${C.border}` : "none" }}>
                <button onClick={() => cardHandlers.onStatusChange(tk.id, tk.status === "concluido" ? "pendente" : "concluido")} className="w-5 h-5 rounded-full border flex-shrink-0 flex items-center justify-center" style={{ borderColor: tk.status === "concluido" ? C.primary : C.border, background: tk.status === "concluido" ? C.primary : "transparent" }}>
                  {tk.status === "concluido" && <Check size={12} color="#fff" />}
                </button>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: q.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate" style={{ color: C.ink, textDecoration: tk.status === "concluido" ? "line-through" : "none" }}>{tk.title}</div>
                  <div className="flex items-center gap-2 text-xs mt-0.5 flex-wrap" style={{ color: C.inkSoft }}>
                    <span>{tk.category === "pessoal" ? t("Pessoal") : t("Profissional")}</span>
                    {tk.dueAt && <span style={{ color: overdue ? C.danger : C.inkSoft, fontWeight: overdue ? 700 : 500 }}>· {fmtDate(tk.dueAt)}{fmtTime(tk.dueAt) ? ` ${fmtTime(tk.dueAt)}` : ""}</span>}
                    {subtasks.length > 0 && <span>· {done}/{subtasks.length}</span>}
                    {tk.recurrence && <span className="inline-flex items-center gap-0.5">· <Repeat size={10} /></span>}
                    {tk.assignee && <span>· {tk.assignee}</span>}
                  </div>
                </div>
                <Badge color={st.color} soft={C.surfaceSunk}>{st.label}</Badge>
                <button onClick={() => cardHandlers.onEdit(tk)} className="p-1.5" style={{ color: C.inkSoft }}><Pencil size={14} /></button>
                <button onClick={() => cardHandlers.onDelete(tk.id)} className="p-1.5" style={{ color: C.danger }}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CalendarView({ tasks, filters, setFilters, activeQuadrant, ...cardHandlers }) {
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const [selectedDate, setSelectedDate] = useState(null);
  const filtered = useMemo(() => applyFilters(tasks, filters, activeQuadrant), [tasks, filters, activeQuadrant]);

  const byDate = useMemo(() => {
    const m = {};
    filtered.forEach((t) => { if (!t.dueAt) return; const key = new Date(t.dueAt).toDateString(); (m[key] = m[key] || []).push(t); });
    return m;
  }, [filtered]);

  const year = month.getFullYear(), mIdx = month.getMonth();
  const firstDay = new Date(year, mIdx, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, mIdx + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, mIdx, d));
  const todayKey = new Date().toDateString();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}><FilterBar filters={filters} setFilters={setFilters} /></div>
      <div className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setMonth(new Date(year, mIdx - 1, 1))} className="p-1.5 rounded-lg" style={{ color: C.inkSoft }}><ChevronLeft size={18} /></button>
          <div className="font-bold capitalize" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{month.toLocaleDateString(locale(), { month: "long", year: "numeric" })}</div>
          <button onClick={() => setMonth(new Date(year, mIdx + 1, 1))} className="p-1.5 rounded-lg" style={{ color: C.inkSoft }}><ChevronRight size={18} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold mb-1" style={{ color: C.inkSoft }}>
          {weekdayNarrow().map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const key = d.toDateString();
            const dayTasks = byDate[key] || [];
            const isToday = key === todayKey;
            const isSelected = selectedDate && key === selectedDate.toDateString();
            return (
              <button key={i} onClick={() => setSelectedDate(d)} className="aspect-square rounded-lg p-1 text-left flex flex-col overflow-hidden border" style={{ borderColor: isSelected ? C.primary : isToday ? C.accent : C.border, background: isSelected ? C.primarySoft : C.surface }}>
                <span className="text-xs font-semibold" style={{ color: isToday ? C.accent : C.ink }}>{d.getDate()}</span>
                <div className="flex flex-wrap gap-0.5 mt-0.5">
                  {dayTasks.slice(0, 3).map((t) => { const q = QUADRANTS.find((x) => x.id === t.quadrant) || QUADRANTS[3]; return <span key={t.id} className="w-1.5 h-1.5 rounded-full" style={{ background: q.color }} />; })}
                  {dayTasks.length > 3 && <span className="text-[9px]" style={{ color: C.inkSoft }}>+{dayTasks.length - 3}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedDate && (
        <div>
          <div className="text-sm font-semibold mb-2 capitalize" style={{ color: C.ink }}>{selectedDate.toLocaleDateString(locale(), { weekday: "long", day: "2-digit", month: "long" })}</div>
          {(byDate[selectedDate.toDateString()] || []).length === 0 ? <EmptyState /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sortByPriority(byDate[selectedDate.toDateString()] || []).map((t) => <TaskCard key={t.id} task={t} {...cardHandlers} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TimelineView({ tasks, filters, setFilters, activeQuadrant, ...cardHandlers }) {
  const filtered = useMemo(() => applyFilters(tasks, filters, activeQuadrant), [tasks, filters, activeQuadrant]);
  const withDate = filtered.filter((t) => t.dueAt).sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const withoutDate = filtered.filter((t) => !t.dueAt);
  const groups = [];
  withDate.forEach((t) => {
    const key = new Date(t.dueAt).toDateString();
    const g = groups.find((g) => g.key === key);
    if (g) g.tasks.push(t); else groups.push({ key, date: new Date(t.dueAt), tasks: [t] });
  });

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-4" style={{ background: C.surface, border: `1px solid ${C.border}` }}><FilterBar filters={filters} setFilters={setFilters} /></div>

      {withoutDate.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: C.surfaceSunk }}>
          <div className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: C.inkSoft }}>{t("Sem prazo definido")}</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{withoutDate.map((t) => <TaskCard key={t.id} task={t} {...cardHandlers} />)}</div>
        </div>
      )}

      {groups.length === 0 ? (withoutDate.length === 0 && <EmptyState />) : (
        <div className="relative pl-6">
          <div className="absolute left-[7px] top-1 bottom-1 w-0.5" style={{ background: C.border }} />
          {groups.map((g) => {
            const overdueDay = g.date.getTime() < new Date().setHours(0, 0, 0, 0);
            return (
              <div key={g.key} className="relative mb-6">
                <div className="absolute -left-6 top-0.5 w-3.5 h-3.5 rounded-full border-2" style={{ background: overdueDay ? C.danger : C.primary, borderColor: C.surface }} />
                <div className="text-sm font-bold mb-2 capitalize" style={{ color: overdueDay ? C.danger : C.ink }}>{g.date.toLocaleDateString(locale(), { weekday: "short", day: "2-digit", month: "short" })}</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">{sortByPriority(g.tasks).map((t) => <TaskCard key={t.id} task={t} {...cardHandlers} />)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function BackupView({ tasks, health, onImport, onImportHealth }) {
  const fileRef = useRef(null);
  const [msg, setMsg] = useState("");

  const exportBackup = () => {
    const json = JSON.stringify({ app: "Vivaro", version: 3, exportedAt: new Date().toISOString(), tasks, health }, null, 2);
    if (isNative) {
      nativeShareFile(`vivaro-backup-${new Date().toISOString().slice(0, 10)}.json`, { text: json })
        .then(() => setMsg(t("Backup pronto: escolha onde guardar (Drive, Ficheiros, e-mail…).")))
        .catch(() => setMsg(t("Não foi possível exportar o backup.")));
      return;
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `vivaro-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    URL.revokeObjectURL(url);
    setMsg(t("Backup exportado com sucesso."));
  };

  const handleImportFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const imported = Array.isArray(data) ? data : data.tasks;
        if (!Array.isArray(imported)) throw new Error("formato inválido");
        onImport(imported);
        if (!Array.isArray(data) && data.health && onImportHealth) onImportHealth(data.health);
        setMsg(t("{n} tarefas importadas com sucesso.", { n: imported.length }));
      } catch (err) {
        setMsg(t("Não foi possível ler o arquivo de backup. Verifique o formato."));
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="max-w-xl space-y-4">
      <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 mb-1"><Download size={18} color={C.primary} /><h3 className="font-bold" style={{ color: C.ink }}>{t("Exportar backup")}</h3></div>
        <p className="text-sm mb-3" style={{ color: C.inkSoft }}>{t("Gere um arquivo .json com todas as suas tarefas, prazos, lembretes, subtarefas, comentários e anexos. Guarde-o em local seguro.")}</p>
        <button onClick={exportBackup} className="px-4 py-2.5 rounded-xl font-semibold text-sm text-white" style={{ background: C.primary }}>{t("Exportar tarefas (")}{tasks.length})</button>
      </div>
      <div className="rounded-2xl p-5" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
        <div className="flex items-center gap-2 mb-1"><Upload size={18} color={C.accent} /><h3 className="font-bold" style={{ color: C.ink }}>{t("Restaurar backup")}</h3></div>
        <p className="text-sm mb-3" style={{ color: C.inkSoft }}>{t("Importe um arquivo .json exportado anteriormente. As tarefas importadas serão adicionadas às atuais.")}</p>
        <button onClick={() => fileRef.current?.click()} className="px-4 py-2.5 rounded-xl font-semibold text-sm border" style={{ borderColor: C.border, color: C.ink }}>{t("Selecionar arquivo de backup")}</button>
        <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
      </div>
      {msg && <div className="text-sm font-medium px-4 py-3 rounded-xl" style={{ background: C.primarySoft, color: C.primaryDark }}>{msg}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  App                                                                 */
/* ------------------------------------------------------------------ */
export default function App() {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("dashboard");
  const [modalTask, setModalTask] = useState(undefined);
  const [voicePrefill, setVoicePrefill] = useState(null);
  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === "light" || saved === "dark") return saved;
      if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    } catch (e) { /* ignore */ }
    return "light";
  });
  const [activeQuadrant, setActiveQuadrant] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [noteViewer, setNoteViewer] = useState(null);
  const [showAbout, setShowAbout] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  const [showNativeSettings, setShowNativeSettings] = useState(false);
  const [nativeInfo, setNativeInfo] = useState({ notifications: true, exactAlarms: true, batteryExempt: true, keepAlive: false, sdk: 0 });
  const [flash, setFlash] = useState("");
  const [lang, setLangState] = useState(() => detectLang());
  const [moduleId, setModuleId] = useState("tarefas");
  const [health, setHealth] = useState(loadHealth);
  const [waterPrompt, setWaterPrompt] = useState(null);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installVariant, setInstallVariant] = useState(null);
  const [showInstallBanner, setShowInstallBanner] = useState(true);
  const [notifPermission, setNotifPermission] = useState(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
  const [showNotifBanner, setShowNotifBanner] = useState(true);
  const [toasts, setToasts] = useState([]);
  const firedRemindersRef = useRef(new Set());
  const [filters, setFilters] = useState({ category: "todas", statuses: [], overdueOnly: false, onTimeOnly: false, hideDone: true });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setTasks(JSON.parse(raw).map(normalizeTask));
    } catch (e) { /* no data yet */ }
    finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks)); } catch (e) { /* storage full/unavailable */ }
  }, [tasks, loaded]);

  useEffect(() => {
    try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch (e) { /* ignore */ }
    document.documentElement.style.colorScheme = theme;
    document.documentElement.style.background = theme === "dark" ? DARK_PALETTE.bg : LIGHT_PALETTE.bg;
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === "dark" ? "light" : "dark")), []);

  // PWA install: Android/Chrome fires `beforeinstallprompt`; iOS Safari never does,
  // so we detect iOS separately and show manual "Adicionar à Tela de Início" instructions.
  useEffect(() => {
    const isStandalone = window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone;
    if (isStandalone) { setInstallVariant(null); return; }
    try { if (localStorage.getItem("vivaro:installDismissed") === "1") { setShowInstallBanner(false); return; } } catch (e) { /* ignore */ }

    const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
    if (isIOS) { setInstallVariant("ios"); return; }

    const handler = (e) => { e.preventDefault(); setInstallPrompt(e); setInstallVariant("android"); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setInstallVariant(null);
  }, [installPrompt]);

  const dismissInstallBanner = useCallback(() => {
    setShowInstallBanner(false);
    try { localStorage.setItem("vivaro:installDismissed", "1"); } catch (e) { /* ignore */ }
  }, []);

  // Load already-fired reminders so we don't repeat notifications after a reload
  useEffect(() => {
    try {
      const raw = localStorage.getItem(FIRED_REMINDERS_KEY);
      if (raw) firedRemindersRef.current = new Set(JSON.parse(raw));
    } catch (e) { /* ignore */ }
  }, []);

  const requestNotifPermission = useCallback(() => {
    if (typeof Notification === "undefined") { setNotifPermission("unsupported"); return; }
    Notification.requestPermission().then((perm) => setNotifPermission(perm));
  }, []);

  const dismissToast = useCallback((id) => setToasts((prev) => prev.filter((t) => t.id !== id)), []);

  // Background reminder check: runs every 20s while the app tab is open.
  // NOTE: because Vivaro is a static site (no server / push service), reminders
  // only fire while this tab/PWA is open or was recently active in the background —
  // closing it fully stops delivery. Installing Vivaro on the phone's home screen
  // (see the "Instalar app" banner) makes this behave much more like a real app.
  const fireNotification = useCallback((title, options) => {
    if (isNative) return; // no APK os avisos são entregues pelo código nativo (alarmes exatos)
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    // Prefer firing through the installed service worker: on Android this is what
    // makes the alert show up as a proper system notification even when the PWA
    // is only running in the background, rather than in the foreground tab.
    if (navigator.serviceWorker && navigator.serviceWorker.ready) {
      navigator.serviceWorker.ready
        .then((reg) => {
          if (reg && reg.showNotification) reg.showNotification(title, options);
          else new Notification(title, options);
        })
        .catch(() => { try { new Notification(title, options); } catch (e) { /* ignore */ } });
    } else {
      try { new Notification(title, options); } catch (e) { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const checkReminders = () => {
      const now = Date.now();
      let changed = false;
      tasks.forEach((task) => {
        if (!task.dueAt || task.status === "concluido" || task.status === "cancelado") return;
        const dueMs = new Date(task.dueAt).getTime();
        (task.reminders || []).forEach((r) => {
          const key = `${task.id}:${r.id}`;
          if (firedRemindersRef.current.has(key)) return;
          const offsetMs = (r.value || 0) * (REMINDER_MS[r.unit] || REMINDER_MS.hours);
          const remindAt = dueMs - offsetMs;
          // Fire once the reminder time has passed, with a 2h grace window after
          // the due date in case the app was closed when the reminder was due.
          if (now >= remindAt && now <= dueMs + 2 * 60 * 60 * 1000) {
            firedRemindersRef.current.add(key);
            changed = true;
            setToasts((prev) => [...prev, { id: uid(), task }]);
            fireNotification(`${t("Lembrete:")} ${task.title}`, {
              body: t("Prazo {when}", { when: `${fmtDate(task.dueAt)}${fmtTime(task.dueAt) ? ` · ${fmtTime(task.dueAt)}` : ""}`.trim() }),
              icon: `${BASE}icon-192.png`,
              badge: `${BASE}icon-192.png`,
              tag: key,
              vibrate: [200, 100, 200],
            });
          }
        });
      });
      if (changed) {
        try { localStorage.setItem(FIRED_REMINDERS_KEY, JSON.stringify([...firedRemindersRef.current])); } catch (e) { /* ignore */ }
      }
    };
    checkReminders();
    const interval = setInterval(checkReminders, 20000);
    return () => clearInterval(interval);
  }, [tasks, loaded, fireNotification]);

  const saveTask = useCallback((task) => {
    setTasks((prev) => {
      const existing = prev.find((t) => t.id === task.id);
      const wasCompleted = existing?.status === "concluido";
      const nowCompleted = task.status === "concluido";
      let list = existing ? prev.map((t) => (t.id === task.id ? task : t)) : [task, ...prev];
      if (nowCompleted && !wasCompleted && task.recurrence) {
        const nextDue = computeNextOccurrence(task);
        if (nextDue) {
          list = [{ ...task, id: uid(), status: "pendente", dueAt: nextDue, completedAt: null, subtasks: (task.subtasks || []).map((s) => ({ ...s, done: false })), comments: [], createdAt: new Date().toISOString() }, ...list];
        }
      }
      return list;
    });
    setModalTask(undefined);
    setVoicePrefill(null);
  }, []);

  const deleteTask = useCallback((id) => setTasks((prev) => prev.filter((t) => t.id !== id)), []);

  const changeStatus = useCallback((id, status) => {
    setTasks((prev) => {
      let spawn = null;
      const list = prev.map((t) => {
        if (t.id !== id) return t;
        const wasCompleted = t.status === "concluido";
        const updated = { ...t, status, completedAt: status === "concluido" ? new Date().toISOString() : (status === t.status ? t.completedAt : null) };
        if (status === "concluido" && !wasCompleted && t.recurrence) {
          const nextDue = computeNextOccurrence(updated);
          if (nextDue) spawn = { ...t, id: uid(), status: "pendente", dueAt: nextDue, completedAt: null, subtasks: (t.subtasks || []).map((s) => ({ ...s, done: false })), comments: [], createdAt: new Date().toISOString() };
        }
        return updated;
      });
      return spawn ? [spawn, ...list] : list;
    });
  }, []);

  const exportGCal = useCallback((task) => window.open(googleCalendarUrl(task), "_blank"), []);

  const importTasks = useCallback((imported) => {
    setTasks((prev) => [...imported.map((t) => normalizeTask({ ...t, id: uid() })), ...prev]);
  }, []);

  const openAttachment = useCallback((att) => {
    if (att.kind === "image") { setLightbox(att.dataUrl); return; }
    if (att.kind === "file") {
      if (isNative) { nativeShareFile(att.name || "documento", { dataUrl: att.dataUrl }).catch(() => {}); return; }
      window.open(att.dataUrl, "_blank"); return;
    }
    if (att.kind === "link") { window.open(/^https?:\/\//i.test(att.url) ? att.url : `https://${att.url}`, "_blank"); return; }
    if (att.kind === "note") { setNoteViewer(att); return; }
    if (att.kind === "location") {
      const q = att.lat && att.lng ? `${att.lat},${att.lng}` : encodeURIComponent(att.address || "");
      window.open(`https://www.google.com/maps?q=${q}`, "_blank");
    }
  }, []);

  const handleVoiceResult = useCallback((transcript) => {
    const parsed = parseVoiceText(transcript);
    setVoicePrefill(parsed);
    setModalTask(null);
  }, []);

  /* ---------------- Saúde / Hidratação ---------------- */
  useEffect(() => {
    try { localStorage.setItem(HEALTH_KEY, JSON.stringify(health)); } catch (e) { /* ignore */ }
  }, [health]);

  const updateHydration = useCallback((patch) => setHealth((h) => ({ ...h, hydration: { ...h.hydration, ...patch } })), []);
  const addWater = useCallback((ml, atIso, silent) => {
    const entry = { id: uid(), at: atIso || new Date().toISOString(), ml: Math.round(ml) };
    setHealth((h) => ({ ...h, hydration: { ...h.hydration, log: [...h.hydration.log, entry].slice(-800) } }));
    setWaterPrompt(null);
    if (!silent) { setFlash(t("Registado: {n} ml", { n: entry.ml })); setTimeout(() => setFlash(""), 2500); }
  }, []);
  const removeWater = useCallback((id) => setHealth((h) => ({ ...h, hydration: { ...h.hydration, log: h.hydration.log.filter((e) => e.id !== id) } })), []);
  const importHealth = useCallback((incoming) => {
    if (!incoming || !incoming.hydration) return;
    setHealth((h) => {
      const seen = new Set(h.hydration.log.map((e) => e.id));
      const extra = (incoming.hydration.log || []).filter((e) => e && e.id && !seen.has(e.id));
      return { ...h, hydration: { ...h.hydration, ...incoming.hydration, log: [...h.hydration.log, ...extra].slice(-800) } };
    });
  }, []);
  const changeLang = useCallback((code) => {
    setLang(code);
    setLangState(code);
    try { localStorage.setItem("vivaro:lang", code); } catch (e) { /* ignore */ }
  }, []);

  // Versão web: cartão com as quantidades quando chega a hora (só com o Vivaro aberto)
  useEffect(() => {
    if (isNative || !loaded || !health.hydration.remindersOn) return;
    const KEY = "vivaro:waterFired";
    const check = () => {
      const hy = health.hydration;
      const nowMs = Date.now();
      if (totalForDay(hy.log, new Date()) >= hy.goalMl) return;
      let fired = [];
      try { fired = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { /* ignore */ }
      const slot = hydrationSlots(hy, 1).find((d) => nowMs >= d.getTime() && nowMs < d.getTime() + 15 * 60000 && !fired.includes(d.getTime()));
      if (!slot) return;
      try { localStorage.setItem(KEY, JSON.stringify([...fired.filter((x) => x > nowMs - 2 * 86400000), slot.getTime()])); } catch (e) { /* ignore */ }
      let idx = 0;
      try { idx = parseInt(localStorage.getItem("vivaro:tipIdx") || "0", 10) || 0; localStorage.setItem("vivaro:tipIdx", String(idx + 1)); } catch (e) { /* ignore */ }
      const tips = hydrationTips();
      const tip = tips[idx % tips.length];
      setWaterPrompt({ id: slot.getTime(), tip });
      fireNotification(t("Hora de beber água 💧"), { body: `💡 ${tip}`, icon: `${BASE}icon-192.png`, badge: `${BASE}icon-192.png`, tag: `hyd:${slot.getTime()}` });
    };
    check();
    const iv = setInterval(check, 30000);
    return () => clearInterval(iv);
  }, [health.hydration, loaded, fireNotification]);

  /* ---------------- Android nativo: estado, sincronização e ações das notificações ---------------- */
  const refreshNative = useCallback(async () => {
    if (!isNative) return;
    setNativeInfo(await nativeStatus());
  }, []);

  // Arranque: pede permissão de notificações na 1.ª vez e mantém o serviço em segundo plano ligado
  useEffect(() => {
    if (!isNative) return;
    (async () => {
      let first = false;
      try { first = !localStorage.getItem("vivaro:nativeInit"); if (first) localStorage.setItem("vivaro:nativeInit", "1"); } catch (e) { /* ignore */ }
      if (first) {
        await nativeRequestNotifications();
        await nativeSetKeepAlive(true);
      } else {
        const st = await nativeStatus();
        if (st.keepAlive) await nativeSetKeepAlive(true);
      }
      setTimeout(refreshNative, 1200);
    })();
    const onVis = () => { if (document.visibilityState === "visible") refreshNative(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refreshNative]);

  // Hidratação no Android: o próprio Android repete os lembretes (dias, horário e frequência), mesmo com a app fechada
  useEffect(() => {
    if (!isNative || !loaded) return;
    const hy = health.hydration;
    const toMin = (v, fb) => { const [h, m] = String(v || "").split(":").map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : fb; };
    nativeSetWater({
      enabled: !!hy.remindersOn,
      days: hy.days,
      startMin: toMin(hy.start, 480),
      endMin: toMin(hy.end, 1320),
      intervalMin: hy.intervalMin,
      amounts: hy.amounts,
      goalMl: hy.goalMl,
      todayMl: totalForDay(hy.log, new Date()),
      dateKey: dayKey(new Date()),
      tips: hydrationTips(),
      title: t("Hora de beber água 💧"),
      question: t("Quanto bebeu? Toque numa quantidade para registar."),
    });
  }, [health.hydration, loaded, lang]);

  // Envia ao Android a lista de lembretes sempre que as tarefas mudam
  useEffect(() => {
    if (!isNative || !loaded) return;
    const now = Date.now();
    const items = [];
    const activeIds = [];
    const nativeLabels = { snooze10: t("Adiar 10 min"), snooze60: t("Adiar 1 h"), done: t("Concluir"), stop: t("Parar") };
    tasks.forEach((task) => {
      if (task.status === "concluido" || task.status === "cancelado") return;
      activeIds.push(task.id);
      if (!task.dueAt) return;
      const dueMs = new Date(task.dueAt).getTime();
      const due = t("Prazo {when}", { when: `${fmtDate(task.dueAt)}${fmtTime(task.dueAt) ? ` · ${fmtTime(task.dueAt)}` : ""}`.trim() });
      const alarm = !!task.alarmMode;
      (task.reminders || []).forEach((r) => {
        const at = dueMs - (r.value || 0) * (REMINDER_MS[r.unit] || REMINDER_MS.hours);
        if (at > now) items.push({ key: `${task.id}:${r.id}`, taskId: task.id, title: `${alarm ? "⏰ " : `${t("Lembrete:")} `}${task.title}`, body: due, at, alarm, labels: nativeLabels });
      });
      if (alarm && dueMs > now) {
        items.push({ key: `${task.id}:due`, taskId: task.id, title: `⏰ ${task.title}`, body: due, at: dueMs, alarm: true, labels: nativeLabels });
      }
    });
    items.sort((a, b) => a.at - b.at);
    nativeSyncReminders(items.slice(0, 400), activeIds);
  }, [tasks, loaded, lang]);

  // Botão "Concluir" da notificação (e outras ações guardadas enquanto a app estava fechada)
  const drainNativeActions = useCallback(async () => {
    const actions = await nativeDrainActions();
    actions.forEach((a) => {
      if (!a) return;
      if (a.type === "done" && a.taskId) changeStatus(a.taskId, "concluido");
      if (a.type === "water" && a.ml > 0) addWater(a.ml, a.at ? new Date(a.at).toISOString() : undefined, true);
    });
  }, [changeStatus, addWater]);

  useEffect(() => {
    if (!isNative || !loaded) return;
    drainNativeActions();
    const off = nativeOnAction(() => drainNativeActions());
    const onVis = () => { if (document.visibilityState === "visible") drainNativeActions(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { off(); document.removeEventListener("visibilitychange", onVis); };
  }, [loaded, drainNativeActions]);

  // Alarmes na app Relógio: só é possível criar com o Vivaro visível e para as próximas 24 h
  useEffect(() => {
    if (!isNative || !loaded) return;
    const KEY = "vivaro:clockAlarmsSet";
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      let done = [];
      try { done = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) { /* ignore */ }
      const now = Date.now();
      for (const task of tasks) {
        if (!task.clockAlarm || !task.dueAt || task.status === "concluido" || task.status === "cancelado") continue;
        const dueMs = new Date(task.dueAt).getTime();
        const d = new Date(dueMs);
        if (dueMs <= now || dueMs - now > 24 * 60 * 60 * 1000) continue;
        if (!d.getHours() && !d.getMinutes()) continue; // sem hora definida
        const k = `${task.id}:${task.dueAt}`;
        if (done.includes(k)) continue;
        try {
          await nativeSetClockAlarm(d.getHours(), d.getMinutes(), task.title);
          done = [...done.slice(-200), k];
          try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) { /* ignore */ }
          setFlash(t("Alarme criado na app Relógio às {time}", { time: fmtTime(task.dueAt) }));
          setTimeout(() => setFlash(""), 4000);
        } catch (e) { /* app Relógio indisponível: o despertador do Vivaro continua a valer */ }
      }
    };
    check();
    const iv = setInterval(check, 60000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", check); };
  }, [tasks, loaded]);

  const cardHandlers = { onEdit: setModalTask, onDelete: deleteTask, onStatusChange: changeStatus, onExport: exportGCal, onOpenAttachment: openAttachment };

  const NAV = [
    { id: "dashboard", get label() { return t("Dashboard"); }, icon: LayoutDashboard },
    { id: "kanban", get label() { return t("Kanban"); }, icon: Columns3 },
    { id: "lista", get label() { return t("Lista"); }, icon: ListIcon },
    { id: "calendario", get label() { return t("Calendário"); }, icon: CalendarIcon },
    { id: "timeline", get label() { return t("Timeline"); }, icon: Milestone },
    { id: "backup", get label() { return t("Backup"); }, icon: DatabaseBackup },
  ];

  return (
    <div key={lang} className="min-h-screen w-full" style={{ ...cssVarsFor(theme), background: C.bg, color: C.ink, fontFamily: "'Inter', sans-serif", colorScheme: theme }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { height: 8px; width: 8px; }
        ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 8px; }
        .line-clamp-2 { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      `}</style>

      <div className="sticky top-0 z-30" style={{ background: C.surface, borderBottom: `1px solid ${C.border}` }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <img
              src={`${BASE}logo.png`} alt={t("Vivaro")} title={t("Sobre o Vivaro")} onClick={() => setShowAbout(true)}
              className="w-9 h-9 rounded-xl object-contain cursor-pointer" style={{ background: C.surfaceSunk }}
            />
            <span className="font-bold text-lg" style={{ color: C.ink, fontFamily: "'Space Grotesk', sans-serif" }}>{t("Vivaro")}</span>
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>

          <div className={`hidden md:flex items-center gap-1 rounded-xl p-1 overflow-x-auto${moduleId !== "tarefas" ? " !hidden" : ""}`} style={{ background: C.surfaceSunk }}>
            {NAV.map((n) => (
              <button key={n.id} onClick={() => setView(n.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all whitespace-nowrap"
                style={{ background: view === n.id ? C.surface : "transparent", color: view === n.id ? C.primary : C.inkSoft, boxShadow: view === n.id ? "0 1px 2px rgba(0,0,0,0.06)" : "none" }}>
                <n.icon size={15} /> {n.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setShowAIChat(true)} title={t("Perguntar sobre tarefas")} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-sm" style={{ background: C.surfaceSunk, color: C.ink }}>
              <Bot size={16} /> <span className="hidden sm:inline">{t("IA")}</span>
            </button>
            {moduleId === "tarefas" && <VoiceCaptureButton onResult={handleVoiceResult} />}
            <button onClick={() => setShowNativeSettings(true)} title={t("Definições")} className="inline-flex items-center px-2.5 py-2 rounded-xl" style={{ background: C.surfaceSunk, color: C.ink }}>
              <Settings size={16} />
            </button>
            {moduleId === "tarefas" && <button onClick={() => setModalTask(null)} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold text-sm text-white" style={{ background: C.accent }}>
              <Plus size={16} /> <span className="hidden sm:inline">{t("Nova tarefa")}</span>
            </button>}
          </div>
        </div>
        <div className={`md:hidden flex items-center gap-1 px-4 pb-3 overflow-x-auto${moduleId !== "tarefas" ? " !hidden" : ""}`}>
          {NAV.map((n) => (
            <button key={n.id} onClick={() => setView(n.id)} className="flex-shrink-0 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap"
              style={{ background: view === n.id ? C.primarySoft : C.surfaceSunk, color: view === n.id ? C.primary : C.inkSoft }}>
              <n.icon size={14} /> {n.label}
            </button>
          ))}
        </div>
      </div>

      <InstallBanner
        variant={showInstallBanner && !isNative ? installVariant : null}
        onInstall={handleInstall}
        onDismiss={dismissInstallBanner}
      />

      {isNative && <NativeSetupBanner status={nativeInfo} onOpen={() => setShowNativeSettings(true)} />}

      <NotificationBanner
        permission={showNotifBanner && !isNative ? notifPermission : "granted"}
        onEnable={requestNotifPermission}
        onDismiss={() => setShowNotifBanner(false)}
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-28">
        {moduleId === "saude" && <HealthView health={health} onChange={updateHydration} onAdd={addWater} onRemove={removeWater} onTest={isNative ? nativeTestWater : null} />}
        {moduleId === "tarefas" && view === "dashboard" && <DashboardView tasks={tasks} filters={filters} setFilters={setFilters} activeQuadrant={activeQuadrant} setActiveQuadrant={setActiveQuadrant} {...cardHandlers} />}
        {moduleId === "tarefas" && view === "kanban" && <KanbanView tasks={tasks} filters={filters} setFilters={setFilters} activeQuadrant={activeQuadrant} setActiveQuadrant={setActiveQuadrant} {...cardHandlers} />}
        {moduleId === "tarefas" && view === "lista" && <ListView tasks={tasks} filters={filters} setFilters={setFilters} activeQuadrant={activeQuadrant} setActiveQuadrant={setActiveQuadrant} {...cardHandlers} />}
        {moduleId === "tarefas" && view === "calendario" && <CalendarView tasks={tasks} filters={filters} setFilters={setFilters} activeQuadrant={activeQuadrant} setActiveQuadrant={setActiveQuadrant} {...cardHandlers} />}
        {moduleId === "tarefas" && view === "timeline" && <TimelineView tasks={tasks} filters={filters} setFilters={setFilters} activeQuadrant={activeQuadrant} setActiveQuadrant={setActiveQuadrant} {...cardHandlers} />}
        {moduleId === "tarefas" && view === "backup" && <BackupView tasks={tasks} health={health} onImport={importTasks} onImportHealth={importHealth} />}
      </div>

      {modalTask !== undefined && (
        <TaskModal initial={modalTask} voicePrefill={voicePrefill} onSave={saveTask} onClose={() => { setModalTask(undefined); setVoicePrefill(null); }} onOpenAttachment={openAttachment} />
      )}
      {lightbox && <Lightbox src={lightbox} onClose={() => setLightbox(null)} />}
      {noteViewer && <NoteViewer note={noteViewer} onClose={() => setNoteViewer(null)} />}
      {showAbout && <AboutModal onClose={() => setShowAbout(false)} />}
      {showNativeSettings && <SettingsModal status={nativeInfo} onRefresh={refreshNative} onClose={() => setShowNativeSettings(false)} lang={lang} onLang={changeLang} />}
      {flash && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[90] px-4 py-2 rounded-xl text-sm font-semibold shadow-lg" style={{ background: C.primary, color: "#fff" }}>{flash}</div>
      )}
      {showAIChat && (
        <AIChatModal
          tasks={tasks}
          onCreateTask={saveTask}
          onUpdateTask={saveTask}
          onCompleteTask={(id) => changeStatus(id, "concluido")}
          onDeleteTask={deleteTask}
          onClose={() => setShowAIChat(false)}
        />
      )}
      {waterPrompt && <WaterPrompt tip={waterPrompt.tip} amounts={health.hydration.amounts} onPick={(ml) => addWater(ml)} onLater={() => setWaterPrompt(null)} />}
      <BottomNav module={moduleId} onChange={setModuleId} />
      <ReminderToasts toasts={toasts} onDismiss={dismissToast} onExport={exportGCal} />
    </div>
  );
}
