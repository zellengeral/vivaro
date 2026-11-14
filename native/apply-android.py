#!/usr/bin/env python3
"""Aplica ao projeto Android (gerado por `npx cap add android`) tudo o que é específico do Vivaro:
plugin nativo, serviço, permissões, ícones e ecrã de arranque. Pode ser executado várias vezes."""
import glob, json, os, re, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NATIVE = ROOT / "native"
AND = ROOT / "android"
APP = AND / "app"

if not APP.exists():
    sys.exit("Pasta android/app não encontrada — corra primeiro: npx cap add android")

pkg = json.loads((ROOT / "capacitor.config.json").read_text())["appId"]
java_dir = APP / "src/main/java" / Path(*pkg.split("."))
java_dir.mkdir(parents=True, exist_ok=True)

# 1) Ficheiros Java
for f in sorted((NATIVE / "android").glob("*.java")):
    text = f.read_text().replace("__PKG__", pkg)
    (java_dir / f.name).write_text(text)
    print("java ->", java_dir / f.name)

# 2) AndroidManifest.xml
mf_path = APP / "src/main/AndroidManifest.xml"
mf = mf_path.read_text()
if "KeepAliveService" not in mf:
    perms = """
    <!-- Vivaro: lembretes nativos, despertador, serviço em segundo plano, voz, câmara -->
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />
    <uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
    <uses-permission android:name="com.android.alarm.permission.SET_ALARM" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />
    <queries>
        <intent><action android:name="android.speech.RecognitionService" /></intent>
        <intent><action android:name="android.media.action.IMAGE_CAPTURE" /></intent>
        <intent><action android:name="android.intent.action.VIEW" /><data android:scheme="https" /></intent>
    </queries>
"""
    comps = """
        <service
            android:name=".KeepAliveService"
            android:exported="false"
            android:foregroundServiceType="specialUse">
            <property
                android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
                android:value="task_reminders" />
        </service>
        <receiver android:name=".ReminderReceiver" android:exported="false" />
        <receiver android:name=".BootReceiver" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
            </intent-filter>
        </receiver>
"""
    if "</application>" not in mf or "</manifest>" not in mf:
        sys.exit("AndroidManifest.xml com formato inesperado")
    mf = mf.replace("</application>", comps + "    </application>", 1)
    mf = mf.replace("</manifest>", perms + "</manifest>", 1)
    mf_path.write_text(mf)
    print("manifest atualizado")

# 3) targetSdk 34 (evita o modo edge-to-edge obrigatório do Android 15 no WebView)
vg = AND / "variables.gradle"
if vg.exists():
    t = vg.read_text()
    t2 = re.sub(r"targetSdkVersion\s*=\s*\d+", "targetSdkVersion = 34", t)
    if t2 != t:
        vg.write_text(t2)
        print("targetSdkVersion = 34")

# 4) Ícones, ícone de estado e ecrã de arranque
res_src = NATIVE / "res"
res_dst = APP / "src/main/res"
for f in res_src.rglob("*"):
    if f.is_file():
        dst = res_dst / f.relative_to(res_src)
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(f, dst)

# remove o splash.png padrão do Capacitor (substituído por drawable-nodpi/splash.xml)
for p in glob.glob(str(res_dst / "drawable*" / "splash.png")):
    os.remove(p)
    print("removido", p)

print("OK — projeto Android preparado")
