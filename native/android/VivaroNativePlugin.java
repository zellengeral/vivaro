package __PKG__;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.AlarmClock;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;

@CapacitorPlugin(
        name = "VivaroNative",
        permissions = {
                @Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "microphone")
        }
)
public class VivaroNativePlugin extends Plugin {

    private static VivaroNativePlugin instance;

    private SpeechRecognizer recognizer;
    private PluginCall speechCall;

    @Override
    public void load() {
        instance = this;
        VivaroCore.ensureChannels(getContext());
    }

    @Override
    protected void handleOnDestroy() {
        if (instance == this) instance = null;
        destroyRecognizer();
    }

    /** Avisa a app (se estiver viva) que há ações novas vindas dos botões da notificação. */
    static void emitPending() {
        VivaroNativePlugin p = instance;
        if (p != null) {
            try {
                p.notifyListeners("nativeAction", new JSObject());
            } catch (Exception ignored) {
            }
        }
    }

    /* ------------------------------ estado e permissões ------------------------------ */

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context c = getContext();
        JSObject r = new JSObject();
        r.put("notifications", NotificationManagerCompat.from(c).areNotificationsEnabled());
        r.put("exactAlarms", VivaroCore.canScheduleExact(c));
        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        r.put("batteryExempt", pm != null && pm.isIgnoringBatteryOptimizations(c.getPackageName()));
        r.put("keepAlive", VivaroCore.prefs(c).getBoolean("keepAlive", false));
        r.put("sdk", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        Activity a = getActivity();
        if (Build.VERSION.SDK_INT >= 33 && a != null
                && ContextCompat.checkSelfPermission(a, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(a, new String[]{Manifest.permission.POST_NOTIFICATIONS}, 7001);
        }
        call.resolve();
    }

    private void startSettings(PluginCall call, Intent primary) {
        Activity a = getActivity();
        try {
            a.startActivity(primary);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getContext().getPackageName()));
                a.startActivity(fallback);
                call.resolve();
            } catch (Exception e2) {
                call.reject("Não foi possível abrir as definições");
            }
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
        i.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        startSettings(call, i);
    }

    @PluginMethod
    public void openExactAlarmSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 31) {
            startSettings(call, new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName())));
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        startSettings(call, new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getContext().getPackageName())));
    }

    @PluginMethod
    public void setKeepAlive(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Context c = getContext();
        VivaroCore.prefs(c).edit().putBoolean("keepAlive", enabled).apply();
        if (enabled) VivaroCore.startKeepAlive(c);
        else VivaroCore.stopKeepAlive(c);
        call.resolve();
    }

    /* ------------------------------ lembretes ------------------------------ */

    @PluginMethod
    public void syncReminders(PluginCall call) {
        JSArray items = call.getArray("items", new JSArray());
        JSArray active = call.getArray("activeTaskIds", new JSArray());
        VivaroCore.sync(getContext(), items, VivaroCore.toSet(active));
        call.resolve();
    }

    @PluginMethod
    public void testNotification(PluginCall call) {
        try {
            long now = System.currentTimeMillis();
            boolean alarm = Boolean.TRUE.equals(call.getBoolean("alarm", false));
            JSONObject it = new JSONObject();
            it.put("key", "test-" + now);
            it.put("taskId", "__test");
            it.put("title", alarm ? "Teste de despertador" : "Teste do Vivaro");
            it.put("body", "Se está a ver isto, os lembretes nativos estão a funcionar.");
            it.put("at", now + 5000);
            it.put("alarm", alarm);
            VivaroCore.schedule(getContext(), it);
            call.resolve();
        } catch (Exception e) {
            call.reject("Falha ao criar o teste");
        }
    }

    /** Guarda a configuração de hidratação e agenda o próximo lembrete (o Android continua a cadeia sozinho). */
    @PluginMethod
    public void setWaterSchedule(PluginCall call) {
        Context c = getContext();
        VivaroCore.prefs(c).edit().putString("water", call.getData().toString()).apply();
        VivaroCore.scheduleNextWater(c);
        call.resolve();
    }

    @PluginMethod
    public void testWater(PluginCall call) {
        try {
            JSONObject it = new JSONObject();
            it.put("key", "hyd:test-" + System.currentTimeMillis());
            it.put("taskId", "__water");
            it.put("kind", "water");
            it.put("title", "");
            it.put("body", "");
            it.put("alarm", false);
            it.put("at", System.currentTimeMillis() + 5000);
            VivaroCore.schedule(getContext(), it);
            call.resolve();
        } catch (Exception e) {
            call.reject("Falha ao criar o teste");
        }
    }

    @PluginMethod
    public void getPendingActions(PluginCall call) {
        Context c = getContext();
        JSONArray arr = VivaroCore.readArray(c, "pending");
        VivaroCore.writeArray(c, "pending", new JSONArray());
        JSObject r = new JSObject();
        r.put("actions", arr);
        call.resolve(r);
    }

    @PluginMethod
    public void setClockAlarm(PluginCall call) {
        Integer hour = call.getInt("hour");
        Integer minute = call.getInt("minute");
        if (hour == null || minute == null) {
            call.reject("Hora inválida");
            return;
        }
        Intent i = new Intent(AlarmClock.ACTION_SET_ALARM)
                .putExtra(AlarmClock.EXTRA_HOUR, hour)
                .putExtra(AlarmClock.EXTRA_MINUTES, minute)
                .putExtra(AlarmClock.EXTRA_MESSAGE, call.getString("message", "Vivaro"))
                .putExtra(AlarmClock.EXTRA_SKIP_UI, true);
        try {
            getActivity().startActivity(i);
            call.resolve();
        } catch (ActivityNotFoundException | SecurityException e) {
            call.reject("Não foi possível criar o alarme na app Relógio");
        } catch (Exception e) {
            call.reject("Falha ao criar o alarme");
        }
    }

    /* ------------------------------ voz ------------------------------ */

    @PluginMethod
    public void startListening(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micCallback");
            return;
        }
        beginListening(call);
    }

    @PermissionCallback
    private void micCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) beginListening(call);
        else call.reject("Permissão do microfone negada");
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        Activity a = getActivity();
        if (a != null) a.runOnUiThread(() -> {
            if (recognizer != null) recognizer.stopListening();
        });
        call.resolve();
    }

    private void beginListening(final PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("O reconhecimento de voz não está disponível neste telemóvel");
            return;
        }
        final String lang = call.getString("lang", "pt-BR");
        getActivity().runOnUiThread(() -> {
            destroyRecognizer();
            speechCall = call;
            recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) {}
                @Override public void onBeginningOfSpeech() {}
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() {}
                @Override public void onPartialResults(Bundle partialResults) {}
                @Override public void onEvent(int eventType, Bundle params) {}

                @Override
                public void onError(int error) {
                    PluginCall c = speechCall;
                    speechCall = null;
                    destroyRecognizer();
                    if (c == null) return;
                    if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) {
                        JSObject r = new JSObject();
                        r.put("text", "");
                        c.resolve(r);
                    } else {
                        c.reject("Erro no reconhecimento de voz (" + error + ")");
                    }
                }

                @Override
                public void onResults(Bundle results) {
                    PluginCall c = speechCall;
                    speechCall = null;
                    ArrayList<String> list = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    destroyRecognizer();
                    if (c == null) return;
                    JSObject r = new JSObject();
                    r.put("text", (list != null && !list.isEmpty()) ? list.get(0) : "");
                    c.resolve(r);
                }
            });
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
            i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognizer.startListening(i);
        });
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            try {
                recognizer.destroy();
            } catch (Exception ignored) {
            }
            recognizer = null;
        }
    }
}
