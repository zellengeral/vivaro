package __PKG__;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Depois de reiniciar o telemóvel (ou atualizar o Vivaro) volta a agendar os lembretes guardados. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String a = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
        try {
            VivaroCore.ensureChannels(c);
            VivaroCore.rescheduleAll(c);
            if (VivaroCore.prefs(c).getBoolean("keepAlive", false)) VivaroCore.startKeepAlive(c);
        } catch (Exception ignored) {
        }
    }
}
