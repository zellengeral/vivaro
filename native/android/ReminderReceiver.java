package __PKG__;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

/** Recebe o disparo dos alarmes e os toques nos botões da notificação (Adiar / Concluir / Parar). */
public class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();
        String key = intent.getStringExtra("key");

        try {
            if (VivaroCore.ACTION_FIRE.equals(action)) {
                if ("water".equals(intent.getStringExtra("kind"))) VivaroCore.onWaterFire(c, intent);
                else VivaroCore.showNotification(c, intent);

            } else if (VivaroCore.ACTION_SNOOZE.equals(action)) {
                int minutes = intent.getIntExtra("minutes", 10);
                VivaroCore.dismissNotification(c, key);
                JSONObject it = new JSONObject();
                it.put("key", VivaroCore.baseKey(key) + VivaroCore.SNOOZE_SUFFIX);
                it.put("taskId", intent.getStringExtra("taskId"));
                it.put("title", intent.getStringExtra("title"));
                it.put("body", intent.getStringExtra("body"));
                it.put("alarm", intent.getBooleanExtra("alarm", false));
                JSONObject lb = new JSONObject();
                for (String k : VivaroCore.LABEL_KEYS) lb.put(k, intent.getStringExtra(k) == null ? "" : intent.getStringExtra(k));
                it.put("labels", lb);
                it.put("at", System.currentTimeMillis() + minutes * 60_000L);
                VivaroCore.addSnoozed(c, it);

            } else if (VivaroCore.ACTION_DONE.equals(action)) {
                VivaroCore.dismissNotification(c, key);
                String taskId = intent.getStringExtra("taskId");
                if (taskId != null && !taskId.isEmpty()) {
                    VivaroCore.cancelTask(c, taskId);
                    JSONObject a = new JSONObject();
                    a.put("type", "done");
                    a.put("taskId", taskId);
                    VivaroCore.addPending(c, a);
                    VivaroNativePlugin.emitPending();
                }

            } else if (VivaroCore.ACTION_WATER.equals(action)) {
                VivaroCore.dismissNotification(c, key);
                JSONObject a = new JSONObject();
                a.put("type", "water");
                a.put("ml", intent.getIntExtra("minutes", 0));
                VivaroCore.addWaterIntake(c, intent.getIntExtra("minutes", 0));
                a.put("at", System.currentTimeMillis());
                VivaroCore.addPending(c, a);
                VivaroNativePlugin.emitPending();

            } else if (VivaroCore.ACTION_STOP.equals(action)) {
                VivaroCore.dismissNotification(c, key);
            }
        } catch (Exception ignored) {
        }
    }
}
