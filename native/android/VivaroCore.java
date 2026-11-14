package __PKG__;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

/** Lógica comum: agendamento de alarmes, canais e notificações do Vivaro. */
public final class VivaroCore {
    private VivaroCore() {}

    static final String PREFS = "vivaro_native";
    static final String CH_REMINDERS = "vivaro_reminders_v1";
    static final String CH_ALARM = "vivaro_alarm_v1";
    static final String CH_KEEP = "vivaro_keepalive_v1";

    static final String ACTION_FIRE = "pt.zellen.vivaro.FIRE";
    static final String ACTION_SNOOZE = "pt.zellen.vivaro.SNOOZE";
    static final String ACTION_DONE = "pt.zellen.vivaro.DONE";
    static final String ACTION_STOP = "pt.zellen.vivaro.STOP";

    static final String SNOOZE_SUFFIX = "#s";

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static JSONArray readArray(Context c, String k) {
        try {
            return new JSONArray(prefs(c).getString(k, "[]"));
        } catch (Exception e) {
            return new JSONArray();
        }
    }

    static void writeArray(Context c, String k, JSONArray a) {
        prefs(c).edit().putString(k, a.toString()).apply();
    }

    static String baseKey(String key) {
        if (key != null && key.endsWith(SNOOZE_SUFFIX)) return key.substring(0, key.length() - SNOOZE_SUFFIX.length());
        return key == null ? "" : key;
    }

    static int notifId(String key) {
        return Math.abs(baseKey(key).hashCode() % 1000000) + 2000;
    }

    /* ------------------------------ canais ------------------------------ */

    static void ensureChannels(Context c) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        NotificationChannel rem = new NotificationChannel(CH_REMINDERS, "Lembretes de tarefas", NotificationManager.IMPORTANCE_HIGH);
        rem.setDescription("Avisos dos lembretes configurados nas tarefas");
        rem.enableVibration(true);
        rem.setVibrationPattern(new long[]{0, 250, 150, 250});
        rem.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(rem);

        NotificationChannel alarm = new NotificationChannel(CH_ALARM, "Despertadores de tarefas", NotificationManager.IMPORTANCE_HIGH);
        alarm.setDescription("Tarefas marcadas como despertador: tocam com som de alarme");
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        alarm.setSound(sound, attrs);
        alarm.enableVibration(true);
        alarm.setVibrationPattern(new long[]{0, 600, 300, 600, 300, 600});
        alarm.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(alarm);

        NotificationChannel keep = new NotificationChannel(CH_KEEP, "Vivaro em segundo plano", NotificationManager.IMPORTANCE_MIN);
        keep.setDescription("Mantém o Vivaro ativo para entregar os lembretes");
        keep.setShowBadge(false);
        nm.createNotificationChannel(keep);
    }

    /* ------------------------------ alarmes ------------------------------ */

    private static void putExtras(Intent i, JSONObject it) {
        i.putExtra("key", it.optString("key"));
        i.putExtra("taskId", it.optString("taskId"));
        i.putExtra("title", it.optString("title"));
        i.putExtra("body", it.optString("body"));
        i.putExtra("alarm", it.optBoolean("alarm", false));
    }

    private static PendingIntent firePending(Context c, JSONObject it) {
        String key = it.optString("key");
        Intent i = new Intent(c, ReminderReceiver.class);
        i.setAction(ACTION_FIRE);
        i.setData(Uri.parse("vivaro://reminder/" + Uri.encode(key)));
        putExtras(i, it);
        return PendingIntent.getBroadcast(c, key.hashCode(), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean canScheduleExact(Context c) {
        if (Build.VERSION.SDK_INT < 31) return true;
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am != null && am.canScheduleExactAlarms();
    }

    static void schedule(Context c, JSONObject it) {
        try {
            long at = it.optLong("at", 0);
            if (at <= System.currentTimeMillis()) return;
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            if (am == null) return;
            PendingIntent pi = firePending(c, it);
            try {
                if (canScheduleExact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
                else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            } catch (SecurityException se) {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (Exception ignored) {
        }
    }

    static void cancel(Context c, JSONObject it) {
        try {
            AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
            PendingIntent pi = firePending(c, it);
            if (am != null) am.cancel(pi);
            pi.cancel();
        } catch (Exception ignored) {
        }
    }

    /** Substitui toda a lista de lembretes pela enviada pela app. */
    static void sync(Context c, JSONArray newItems, Set<String> activeTaskIds) {
        long now = System.currentTimeMillis();

        JSONArray old = readArray(c, "items");
        for (int i = 0; i < old.length(); i++) {
            JSONObject o = old.optJSONObject(i);
            if (o != null) cancel(c, o);
        }
        JSONArray kept = new JSONArray();
        for (int i = 0; i < newItems.length(); i++) {
            JSONObject o = newItems.optJSONObject(i);
            if (o == null || o.optLong("at", 0) <= now) continue;
            kept.put(o);
            schedule(c, o);
        }
        writeArray(c, "items", kept);

        JSONArray snz = readArray(c, "snoozed");
        JSONArray snzKept = new JSONArray();
        for (int i = 0; i < snz.length(); i++) {
            JSONObject o = snz.optJSONObject(i);
            if (o == null) continue;
            if (o.optLong("at", 0) > now && activeTaskIds.contains(o.optString("taskId"))) snzKept.put(o);
            else cancel(c, o);
        }
        writeArray(c, "snoozed", snzKept);
    }

    /** Remove todos os lembretes (incluindo adiados) de uma tarefa. */
    static void cancelTask(Context c, String taskId) {
        for (String listKey : new String[]{"items", "snoozed"}) {
            JSONArray arr = readArray(c, listKey);
            JSONArray kept = new JSONArray();
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o == null) continue;
                if (taskId.equals(o.optString("taskId"))) cancel(c, o);
                else kept.put(o);
            }
            writeArray(c, listKey, kept);
        }
    }

    static void addSnoozed(Context c, JSONObject it) {
        JSONArray arr = readArray(c, "snoozed");
        JSONArray kept = new JSONArray();
        String key = it.optString("key");
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            if (o != null && !key.equals(o.optString("key"))) kept.put(o);
        }
        kept.put(it);
        writeArray(c, "snoozed", kept);
        schedule(c, it);
    }

    /** Reagenda tudo o que estiver guardado (depois de reiniciar o telemóvel ou atualizar a app). */
    static void rescheduleAll(Context c) {
        long now = System.currentTimeMillis();
        for (String listKey : new String[]{"items", "snoozed"}) {
            JSONArray arr = readArray(c, listKey);
            for (int i = 0; i < arr.length(); i++) {
                JSONObject o = arr.optJSONObject(i);
                if (o != null && o.optLong("at", 0) > now) schedule(c, o);
            }
        }
    }

    static void addPending(Context c, JSONObject action) {
        JSONArray arr = readArray(c, "pending");
        arr.put(action);
        writeArray(c, "pending", arr);
    }

    static Set<String> toSet(JSONArray a) {
        Set<String> s = new HashSet<>();
        if (a == null) return s;
        for (int i = 0; i < a.length(); i++) s.add(a.optString(i));
        return s;
    }

    /* --------------------------- notificações --------------------------- */

    private static PendingIntent actionPending(Context c, String action, Intent src, int minutes) {
        String key = src.getStringExtra("key");
        Intent i = new Intent(c, ReminderReceiver.class);
        i.setAction(action);
        i.setData(Uri.parse("vivaro://" + action + "/" + minutes + "/" + Uri.encode(key == null ? "" : key)));
        i.putExtra("key", key);
        i.putExtra("taskId", src.getStringExtra("taskId"));
        i.putExtra("title", src.getStringExtra("title"));
        i.putExtra("body", src.getStringExtra("body"));
        i.putExtra("alarm", src.getBooleanExtra("alarm", false));
        i.putExtra("minutes", minutes);
        int req = (action + minutes + key).hashCode();
        return PendingIntent.getBroadcast(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void showNotification(Context c, Intent src) {
        String key = src.getStringExtra("key");
        String title = src.getStringExtra("title");
        String body = src.getStringExtra("body");
        boolean alarm = src.getBooleanExtra("alarm", false);
        if (title == null) title = "Vivaro";
        if (body == null) body = "";

        ensureChannels(c);
        int nid = notifId(key);

        Intent open = new Intent(c, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(c, nid, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, alarm ? CH_ALARM : CH_REMINDERS)
                .setSmallIcon(R.drawable.ic_stat_vivaro)
                .setColor(0xFF0F6E5E)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(alarm ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_REMINDER)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setAutoCancel(true)
                .setWhen(System.currentTimeMillis())
                .setContentIntent(content);

        b.addAction(0, "Adiar 10 min", actionPending(c, ACTION_SNOOZE, src, 10));
        if (alarm) {
            b.addAction(0, "Concluir", actionPending(c, ACTION_DONE, src, 0));
            b.addAction(0, "Parar", actionPending(c, ACTION_STOP, src, 0));
            b.setTimeoutAfter(5 * 60 * 1000L);
            if (Build.VERSION.SDK_INT < 26) {
                b.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), android.media.AudioManager.STREAM_ALARM);
                b.setVibrate(new long[]{0, 600, 300, 600});
            }
        } else {
            b.addAction(0, "Adiar 1 h", actionPending(c, ACTION_SNOOZE, src, 60));
            b.addAction(0, "Concluir", actionPending(c, ACTION_DONE, src, 0));
            if (Build.VERSION.SDK_INT < 26) b.setDefaults(Notification.DEFAULT_ALL);
        }

        Notification n = b.build();
        if (alarm) n.flags |= Notification.FLAG_INSISTENT;

        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            try {
                nm.notify(nid, n);
            } catch (Exception ignored) {
            }
        }
    }

    static void dismissNotification(Context c, String key) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) nm.cancel(notifId(key));
    }

    /* ------------------------ serviço em segundo plano ------------------------ */

    static void startKeepAlive(Context c) {
        try {
            ContextCompat.startForegroundService(c, new Intent(c, KeepAliveService.class));
        } catch (Exception ignored) {
        }
    }

    static void stopKeepAlive(Context c) {
        try {
            c.stopService(new Intent(c, KeepAliveService.class));
        } catch (Exception ignored) {
        }
    }
}
