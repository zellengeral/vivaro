// Ponte entre o Vivaro (React) e a parte nativa Android (plugin "VivaroNative").
// Na versão web/PWA todas estas funções são inofensivas (isNative = false).
import { Capacitor, registerPlugin } from "@capacitor/core";
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

export const isNative = Capacitor.isNativePlatform();

const VivaroNative = registerPlugin("VivaroNative");

const safe = async (fn, fallback) => {
  if (!isNative) return fallback;
  try { return await fn(); } catch (e) { return fallback; }
};

export const nativeStatus = () =>
  safe(() => VivaroNative.getStatus(), { notifications: false, exactAlarms: false, batteryExempt: false, keepAlive: false, sdk: 0 });

export const nativeRequestNotifications = () => safe(() => VivaroNative.requestNotificationPermission(), null);
export const nativeOpenNotificationSettings = () => safe(() => VivaroNative.openNotificationSettings(), null);
export const nativeOpenExactAlarmSettings = () => safe(() => VivaroNative.openExactAlarmSettings(), null);
export const nativeRequestBatteryExemption = () => safe(() => VivaroNative.requestBatteryExemption(), null);
export const nativeSetKeepAlive = (enabled) => safe(() => VivaroNative.setKeepAlive({ enabled: !!enabled }), null);
export const nativeSetWater = (cfg) => safe(() => VivaroNative.setWaterSchedule(cfg), null);
export const nativeTestWater = () => safe(() => VivaroNative.testWater(), null);
export const nativeTest = (alarm) => safe(() => VivaroNative.testNotification({ alarm: !!alarm }), null);

// items: [{ key, taskId, title, body, at (ms), alarm }]  ·  activeTaskIds: ids das tarefas ainda abertas
export const nativeSyncReminders = (items, activeTaskIds) =>
  safe(() => VivaroNative.syncReminders({ items, activeTaskIds }), null);

// Ações feitas nos botões da notificação enquanto a app estava fechada ou em segundo plano
export const nativeDrainActions = async () => {
  const r = await safe(() => VivaroNative.getPendingActions(), { actions: [] });
  return Array.isArray(r?.actions) ? r.actions : [];
};

export const nativeOnAction = (cb) => {
  if (!isNative) return () => {};
  let handle = null;
  VivaroNative.addListener("nativeAction", cb).then((h) => { handle = h; }).catch(() => {});
  return () => { try { handle && handle.remove(); } catch (e) { /* ignore */ } };
};

// Cria um alarme na app Relógio do telemóvel (só funciona com o Vivaro visível e para as próximas 24 h)
export const nativeSetClockAlarm = (hour, minute, message) =>
  VivaroNative.setClockAlarm({ hour, minute, message });

// Reconhecimento de voz nativo (o WebView do Android não tem a Web Speech API)
export const nativeListen = async (lang = "pt-BR") => {
  const r = await VivaroNative.startListening({ lang });
  return (r && r.text) || "";
};

// O WebView não consegue "descarregar" ficheiros blob/data: guardamos em cache e abrimos a folha de partilha.
export async function nativeShareFile(filename, { text, dataUrl }) {
  const clean = (filename || "vivaro").replace(/[^\w.\- ]+/g, "_").slice(0, 80) || "vivaro";
  let opts;
  if (dataUrl) {
    const comma = dataUrl.indexOf(",");
    opts = { path: clean, data: dataUrl.slice(comma + 1), directory: Directory.Cache };
  } else {
    opts = { path: clean, data: text || "", directory: Directory.Cache, encoding: Encoding.UTF8 };
  }
  const res = await Filesystem.writeFile(opts);
  await Share.share({ title: clean, dialogTitle: "Guardar ou abrir", url: res.uri });
}
