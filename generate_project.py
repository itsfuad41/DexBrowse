import subprocess
import textwrap
from pathlib import Path


def write(path, content):
    file = Path(path)
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(
        textwrap.dedent(content).lstrip(),
        encoding="utf-8"
    )
    print("Created:", path)


write("settings.gradle.kts", """
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "DexBrowse"
include(":app")
""")

write("build.gradle.kts", """
plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
""")

write("gradle.properties", """
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
""")

# ---------------------------------------------------------------------------
# UPDATE-CONFLICT FIX
# Android refuses to install an APK over an installed one when the signing key
# differs ("App not installed as package conflicts with an existing package").
# The old config signed release builds with the *debug* key, which is
# different on every machine / CI run. Now every build (debug + release) is
# signed with ONE fixed keystore: keystore/dexbrowse.jks
# versionCode must also go up on every update.
# ---------------------------------------------------------------------------
write("app/build.gradle.kts", """
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.fuad.dexbrowse"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.fuad.dexbrowse"
        minSdk = 26
        targetSdk = 34
        versionCode = 6
        versionName = "2.3.0"

        buildConfigField(
            "String",
            "CONFIG_URL",
            "\\"https://raw.githubusercontent.com/itsfuad41/DexBrowse/main/config.json\\""
        )
    }

    signingConfigs {
        create("dexbrowse") {
            storeFile = rootProject.file("keystore/dexbrowse.jks")
            storePassword = System.getenv("DEXBROWSE_STORE_PASS") ?: "dexbrowse123"
            keyAlias = "dexbrowse"
            keyPassword = System.getenv("DEXBROWSE_KEY_PASS") ?: "dexbrowse123"
        }
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("dexbrowse")
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("dexbrowse")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }
}
""")

write("app/src/main/AndroidManifest.xml", """
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:allowBackup="false"
        android:icon="@drawable/ic_launcher"
        android:label="DexBrowse"
        android:theme="@style/Theme.DexBrowse"
        android:usesCleartextTraffic="false">

        <activity
            android:name="com.fuad.dexbrowse.MainActivity"
            android:exported="true"
            android:configChanges="orientation|screenSize|keyboardHidden|screenLayout"
            android:windowSoftInputMode="adjustResize">

            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>

        </activity>

    </application>

</manifest>
""")

write("app/src/main/res/values/themes.xml", """
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style
        name="Theme.DexBrowse"
        parent="android:style/Theme.Material.NoActionBar">
        <item name="android:statusBarColor">#0B1220</item>
        <item name="android:navigationBarColor">#0B1220</item>
        <item name="android:windowBackground">#0B1220</item>
        <item name="android:windowLightStatusBar">false</item>
    </style>
</resources>
""")

write("app/src/main/res/drawable/ic_launcher.xml", """
<?xml version="1.0" encoding="utf-8"?>
<vector
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">

    <path
        android:fillColor="#1E1B4B"
        android:pathData="M0,0h108v108h-108z" />

    <path
        android:fillColor="#A855F7"
        android:pathData="M20,24h68c3.3,0 6,2.7 6,6v40c0,3.3 -2.7,6 -6,6H20c-3.3,0 -6,-2.7 -6,-6V30c0,-3.3 2.7,-6 6,-6z" />

    <path
        android:fillColor="#0F172A"
        android:pathData="M24,30h60v34H24z" />

    <path
        android:fillColor="#DDD6FE"
        android:pathData="M46,76h16v8H46z" />

    <path
        android:fillColor="#FFFFFF"
        android:pathData="M36,84h36v4H36z" />

</vector>
""")

write("app/src/main/java/com/fuad/dexbrowse/SecurityManager.kt", """
package com.fuad.dexbrowse

import android.content.Context
import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

class SecurityManager(context: Context) {

    private val prefs = context.getSharedPreferences(
        "dexbrowse_security",
        Context.MODE_PRIVATE
    )

    fun isProtected(): Boolean =
        prefs.contains("password_hash")

    fun username(): String =
        prefs.getString("username", "Guest") ?: "Guest"

    private fun derive(value: String, salt: ByteArray): ByteArray {
        val spec = PBEKeySpec(
            value.toCharArray(),
            salt,
            120000,
            256
        )
        return try {
            SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                .generateSecret(spec).encoded
        } finally {
            spec.clearPassword()
        }
    }

    private fun saveSecret(key: String, value: String) {
        val salt = ByteArray(16)
        SecureRandom().nextBytes(salt)
        prefs.edit()
            .putString(
                key + "_salt",
                Base64.encodeToString(salt, Base64.NO_WRAP)
            )
            .putString(
                key + "_hash",
                Base64.encodeToString(
                    derive(value, salt),
                    Base64.NO_WRAP
                )
            )
            .apply()
    }

    private fun verifySecret(key: String, value: String): Boolean {
        return try {
            val salt = Base64.decode(
                prefs.getString(key + "_salt", "") ?: "",
                Base64.NO_WRAP
            )
            val expected = Base64.decode(
                prefs.getString(key + "_hash", "") ?: "",
                Base64.NO_WRAP
            )
            MessageDigest.isEqual(
                expected,
                derive(value, salt)
            )
        } catch (_: Exception) {
            false
        }
    }

    fun configure(
        name: String,
        password: String,
        recovery: String
    ) {
        require(name.isNotBlank())
        require(password.length >= 8)
        require(recovery.length >= 12)
        prefs.edit()
            .putString("username", name.take(60))
            .apply()
        saveSecret("password", password)
        saveSecret("recovery", recovery)
    }

    fun verifyPassword(value: String): Boolean =
        verifySecret("password", value)

    fun verifyRecovery(value: String): Boolean =
        verifySecret("recovery", value)

    fun resetPassword(value: String) {
        require(value.length >= 8)
        saveSecret("password", value)
    }
}
""")

# NEW: remember-password storage. The password is encrypted with an AES-256-GCM
# key that lives in the Android Keystore (the key never leaves the device and
# can't be extracted). allowBackup=false so the ciphertext is never restored
# onto another device.
write("app/src/main/java/com/fuad/dexbrowse/PasswordVault.kt", """
package com.fuad.dexbrowse

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class PasswordVault(context: Context) {

    private val prefs = context.getSharedPreferences(
        "dexbrowse_vault",
        Context.MODE_PRIVATE
    )

    private val alias = "dexbrowse_remember_key"

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(alias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        )
        generator.init(
            KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        )
        return generator.generateKey()
    }

    fun isRemembered(): Boolean = prefs.contains("blob")

    fun save(password: String) {
        try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key())
            val encrypted = cipher.doFinal(password.toByteArray(Charsets.UTF_8))
            prefs.edit()
                .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
                .putString("blob", Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .apply()
        } catch (_: Exception) {
            clear()
        }
    }

    fun load(): String? {
        return try {
            val iv = Base64.decode(prefs.getString("iv", null) ?: return null, Base64.NO_WRAP)
            val blob = Base64.decode(prefs.getString("blob", null) ?: return null, Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            String(cipher.doFinal(blob), Charsets.UTF_8)
        } catch (_: Exception) {
            clear()
            null
        }
    }

    fun clear() {
        prefs.edit().clear().apply()
    }
}
""")

write("app/src/main/java/com/fuad/dexbrowse/HistoryManager.kt", """
package com.fuad.dexbrowse

import android.content.Context
import org.json.JSONArray

class HistoryManager(context: Context) {

    private val prefs = context.getSharedPreferences(
        "dexbrowse_history",
        Context.MODE_PRIVATE
    )

    fun add(url: String) {
        if (!url.startsWith("https://")) return
        val items = getAll().toMutableList()
        items.remove(url)
        items.add(0, url)
        prefs.edit()
            .putString(
                "history",
                JSONArray(items.take(500)).toString()
            )
            .apply()
    }

    fun getAll(): List<String> {
        return try {
            val array = JSONArray(
                prefs.getString("history", "[]")
            )
            List(array.length()) {
                array.getString(it)
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    fun clear() {
        prefs.edit().remove("history").apply()
    }
}
""")

write("app/src/main/java/com/fuad/dexbrowse/AdBlockManager.kt", """
package com.fuad.dexbrowse

import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream

class AdBlockManager {

    var enabled = true

    private val blocked = setOf(
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "adnxs.com",
        "taboola.com",
        "outbrain.com"
    )

    fun intercept(url: String): WebResourceResponse? {
        if (!enabled) return null
        val uri = Uri.parse(url)
        val host = uri.host?.lowercase() ?: return null
        if (uri.scheme != "https" && uri.scheme != "http") {
            return null
        }
        if (blocked.none {
                host == it || host.endsWith(".$it")
            }) {
            return null
        }
        return WebResourceResponse(
            "text/plain",
            "UTF-8",
            ByteArrayInputStream(ByteArray(0))
        )
    }
}
""")

write("app/src/main/java/com/fuad/dexbrowse/MainActivity.kt", r'''
package com.fuad.dexbrowse

import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.text.TextUtils
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.CheckBox
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.graphics.Typeface
import org.json.JSONObject
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {

    private class Tab(
        val web: WebView,
        var title: String = "DexBrowse Start",
        var start: Boolean = true
    )

    // ---------- palette (matches the screenshots) ----------
    private val bg = Color.parseColor("#0B1220")
    private val panel = Color.parseColor("#1E293B")
    private val navBg = Color.parseColor("#27354B")
    private val border = Color.parseColor("#3B4A63")
    private val sky = Color.parseColor("#38BDF8")
    private val blue = Color.parseColor("#0284C7")
    private val wideOn = Color.parseColor("#0C6BA5")
    private val purpleBg = Color.parseColor("#3B1F6E")
    private val purple = Color.parseColor("#8B5CF6")
    private val muted = Color.parseColor("#94A3B8")

    private val matchP = ViewGroup.LayoutParams.MATCH_PARENT
    private val wrapC = ViewGroup.LayoutParams.WRAP_CONTENT

    private lateinit var security: SecurityManager
    private lateinit var history: HistoryManager
    private lateinit var vault: PasswordVault
    private val blocker = AdBlockManager()

    private lateinit var root: LinearLayout
    private lateinit var content: FrameLayout
    private lateinit var address: EditText
    private lateinit var tabStrip: LinearLayout
    private lateinit var uaLabel: TextView
    private lateinit var uaBtn: TextView
    private lateinit var aiBtn: TextView
    private lateinit var engineBtn: TextView
    private lateinit var wideBtn: TextView
    private lateinit var aiPanel: LinearLayout
    private lateinit var aiTitle: TextView
    private var aiWeb: WebView? = null

    private val tabs = mutableListOf<Tab>()
    private var activeTab = -1
    private var browserVisible = false

    private var killed = false
    private var minVersion = 1
    private var updateUrl = ""

    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()

    private val prefs by lazy {
        getSharedPreferences("dexbrowse_settings", MODE_PRIVATE)
    }

    private val startBase = "https://dexbrowse.local"

    private val desktopUA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/131.0.0.0 Safari/537.36"

    private val mobileUA by lazy { WebSettings.getDefaultUserAgent(this) }

    private val searchEngines = linkedMapOf(
        "Google" to "https://www.google.com/search?q=",
        "Bing" to "https://www.bing.com/search?q=",
        "DuckDuckGo" to "https://duckduckgo.com/?q=",
        "Brave" to "https://search.brave.com/search?q=",
        "Perplexity" to "https://www.perplexity.ai/search?q="
    )

    private val aiSites = linkedMapOf(
        "Perplexity AI" to "https://www.perplexity.ai",
        "ChatGPT" to "https://chatgpt.com",
        "Google Gemini" to "https://gemini.google.com",
        "Microsoft Copilot" to "https://copilot.microsoft.com"
    )

    // Start page, laid out at 1366px like a real desktop browser.
    private val startPage = """
<!doctype html><html><head><meta charset="utf-8"><title>DexBrowse Start</title>
<meta name="viewport" content="width=1366">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,#0f172a,#0a0e1a);font-family:Segoe UI,Roboto,Arial,sans-serif;color:#e2e8f0}
.box{width:620px;text-align:center}
h1{margin:0;font-size:30px;color:#38bdf8}
.sub{font-size:12.5px;color:#94a3b8;margin:4px 0 18px}
.eng{display:flex;gap:8px;justify-content:center;margin-bottom:12px}
.eng button{background:#1e293b;color:#cbd5e1;border:1px solid #334155;border-radius:20px;padding:5px 14px;font-size:12px}
.eng button.on{background:#0284c7;color:#fff;border-color:#38bdf8;font-weight:700}
form{display:flex}
form input{flex:1;min-width:0;background:#0b1426;color:#e2e8f0;border:1px solid #334155;border-right:0;border-radius:8px 0 0 8px;padding:13px 16px;font-size:13px;outline:none}
form button{background:#0284c7;color:#fff;border:0;border-radius:0 8px 8px 0;padding:0 26px;font-weight:700;font-size:13px}
.row{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:16px}
.row+.row{margin-top:10px}
.row a{text-decoration:none;color:#e2e8f0;font-size:12px;padding:9px 16px;border-radius:8px;background:#1e293b;border:1px solid #334155}
.row.ai a{background:#2a1b4e;border-color:#6d28d9}
</style></head><body>
<div class="box">
<h1>🖥️ DexBrowse By Fuad</h1>
<div class="sub">Windows 11 x64 Desktop Engine • Multi-Search &amp; DexAI Suite</div>
<div class="eng" id="eng"></div>
<form id="f"><input id="q" type="text" placeholder="Search the web or enter any PC website URL..." autocomplete="off"><button type="submit">Search</button></form>
<div class="row ai">
<a href="dexbrowse://ai">✨ Open DexAI Sidebar</a>
<a href="https://www.perplexity.ai">🧠 Perplexity AI</a>
<a href="https://chatgpt.com">🤖 ChatGPT</a>
<a href="https://gemini.google.com">✦ Google Gemini</a>
</div>
<div class="row">
<a href="https://www.youtube.com">▶ YouTube PC</a>
<a href="https://github.com">🐙 GitHub</a>
<a href="https://www.whatismybrowser.com/detect/what-is-my-user-agent/">🔍 Test My PC UA</a>
</div>
</div>
<script>
var sel='__SEL__';
var map={Google:'Google',Bing:'Bing AI',DuckDuckGo:'DuckDuckGo',Brave:'Brave',Perplexity:'Perplexity AI'};
var eng=document.getElementById('eng');
Object.keys(map).forEach(function(k){
  var b=document.createElement('button');
  b.type='button';b.textContent=map[k];
  if(k===sel)b.className='on';
  b.onclick=function(){sel=k;[].forEach.call(eng.children,function(c){c.className=''});b.className='on'};
  eng.appendChild(b);
});
document.getElementById('f').onsubmit=function(e){
  e.preventDefault();
  var q=document.getElementById('q').value.trim();
  if(q)location.href='dexbrowse://search?e='+encodeURIComponent(sel)+'&q='+encodeURIComponent(q);
};
</script></body></html>
"""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        security = SecurityManager(this)
        history = HistoryManager(this)
        vault = PasswordVault(this)
        blocker.enabled = prefs.getBoolean("adblock", true)

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(bg)
        }
        setContentView(root)

        if (security.isProtected()) {
            showLock()
        } else {
            showBrowser()
        }

        checkRemoteConfig()
    }

    // ---------- small UI helpers ----------

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    private fun shape(fill: Int, stroke: Int = Color.TRANSPARENT, radius: Int = 12): GradientDrawable =
        GradientDrawable().apply {
            setColor(fill)
            cornerRadius = dp(radius).toFloat()
            if (stroke != Color.TRANSPARENT) setStroke(dp(1), stroke)
        }

    private fun lp(
        w: Int,
        h: Int,
        weight: Float = 0f,
        l: Int = 0,
        t: Int = 0,
        r: Int = 0,
        b: Int = 0
    ): LinearLayout.LayoutParams =
        LinearLayout.LayoutParams(w, h, weight).apply {
            setMargins(dp(l), dp(t), dp(r), dp(b))
        }

    private fun chip(label: String, fill: Int, stroke: Int, onClick: () -> Unit): TextView =
        TextView(this).apply {
            text = label
            setTextColor(Color.WHITE)
            textSize = 14f
            gravity = Gravity.CENTER
            setSingleLine(true)
            setPadding(dp(12), dp(9), dp(12), dp(9))
            background = shape(fill, stroke)
            setOnClickListener { onClick() }
        }

    private fun field(hintText: String, secret: Boolean = false): EditText =
        EditText(this).apply {
            hint = hintText
            setTextColor(Color.WHITE)
            setHintTextColor(muted)
            setSingleLine(true)
            if (secret) {
                inputType = InputType.TYPE_CLASS_TEXT or
                    InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
        }

    private fun dialog(): AlertDialog.Builder =
        AlertDialog.Builder(this, android.R.style.Theme_Material_Dialog_Alert)

    private fun toast(message: String, long: Boolean = false) {
        Toast.makeText(
            this,
            message,
            if (long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT
        ).show()
    }

    // ---------- lock screen ----------

    private fun showLock() {
        browserVisible = false
        root.removeAllViews()
        root.gravity = Gravity.CENTER

        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(26), dp(30), dp(26), dp(26))
            background = shape(panel, border, 28)
        }

        card.addView(TextView(this).apply {
            text = "🖥️ DexBrowse By Fuad"
            textSize = 24f
            setTypeface(null, Typeface.BOLD)
            setTextColor(sky)
        })

        card.addView(
            TextView(this).apply {
                text = "PC Browser + AI Edition • Enter password to open"
                textSize = 14f
                gravity = Gravity.CENTER
                setTextColor(Color.parseColor("#E2E8F0"))
            },
            lp(matchP, wrapC, 0f, 0, 14, 0, 22)
        )

        val password = field("Device Password", true).apply {
            typeface = Typeface.MONOSPACE
            textSize = 20f
            setPadding(dp(18), dp(16), dp(18), dp(16))
            background = shape(Color.parseColor("#0B1426"), border, 18)
        }
        card.addView(password, lp(matchP, wrapC))

        val remember = CheckBox(this).apply {
            text = "Remember password on this device"
            setTextColor(Color.parseColor("#CBD5E1"))
            buttonTintList = ColorStateList.valueOf(sky)
        }
        card.addView(remember, lp(matchP, wrapC, 0f, 0, 10, 0, 4))

        val saved = vault.load()
        if (saved != null) {
            password.setText(saved)
            remember.isChecked = true
        }

        val unlock = TextView(this).apply {
            text = "UNLOCK DEXBROWSE"
            textSize = 16f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            background = shape(blue, blue, 18)
            setOnClickListener { tryUnlock(password, remember) }
        }
        card.addView(unlock, lp(matchP, dp(58), 0f, 0, 12, 0, 0))

        card.addView(
            TextView(this).apply {
                text = "Forgot Password?"
                textSize = 14f
                gravity = Gravity.CENTER
                setTextColor(sky)
                setPadding(dp(8), dp(8), dp(8), dp(8))
                setOnClickListener { showRecovery() }
            },
            lp(matchP, wrapC, 0f, 0, 12, 0, 0)
        )

        root.addView(card, lp(matchP, wrapC, 0f, 24, 0, 24, 0))
    }

    private fun tryUnlock(password: EditText, remember: CheckBox) {
        val value = password.text.toString()
        if (security.verifyPassword(value)) {
            if (remember.isChecked) vault.save(value) else vault.clear()
            showBrowser()
        } else {
            password.setText("")
            toast("Incorrect password")
        }
    }

    private fun showRecovery() {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
        }
        val phrase = field("Recovery Phrase", true)
        val password = field("New Password (8+ characters)", true)
        box.addView(phrase)
        box.addView(password)

        dialog()
            .setTitle("Recover DexBrowse")
            .setView(box)
            .setPositiveButton("Reset") { _, _ ->
                if (
                    security.verifyRecovery(phrase.text.toString()) &&
                    password.text.length >= 8
                ) {
                    security.resetPassword(password.text.toString())
                    vault.clear()
                    toast("Password updated")
                    showLock()
                } else {
                    toast("Recovery failed")
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun lockNow() {
        if (!security.isProtected()) {
            toast("Set a password first")
            configureProtection()
            return
        }
        showLock()
        toast("Locked")
    }

    // ---------- browser screen ----------

    private fun showBrowser() {
        browserVisible = true
        root.removeAllViews()
        root.gravity = Gravity.TOP

        // header: title, UA label, AI / PC UA / Lock
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(12), dp(10), dp(10), dp(10))
            setBackgroundColor(bg)
        }
        header.addView(TextView(this).apply {
            text = "🖥️ DexBrowse By Fuad"
            textSize = 17f
            setTypeface(null, Typeface.BOLD)
            setTextColor(sky)
            setSingleLine(true)
            setOnClickListener { showSettings() }
        })
        uaLabel = TextView(this).apply {
            textSize = 15f
            setTextColor(muted)
            setSingleLine(true)
            ellipsize = TextUtils.TruncateAt.END
            setPadding(dp(8), 0, dp(6), 0)
        }
        header.addView(uaLabel, lp(0, wrapC, 1f))
        aiBtn = chip("✨ AI", purpleBg, purple) { toggleAi() }
        uaBtn = chip("⚙ PC UA", panel, border) { togglePcUa() }
        header.addView(aiBtn, lp(wrapC, wrapC, 0f, 3, 0, 3, 0))
        header.addView(uaBtn, lp(wrapC, wrapC, 0f, 3, 0, 3, 0))
        header.addView(chip("🔒 Lock", panel, border) { lockNow() }, lp(wrapC, wrapC, 0f, 3, 0, 0, 0))
        root.addView(header)

        // tab row
        val tabRow = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(panel)
            setPadding(dp(8), dp(8), dp(8), dp(8))
        }
        tabStrip = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }
        tabRow.addView(
            HorizontalScrollView(this).apply {
                isHorizontalScrollBarEnabled = false
                addView(tabStrip)
            },
            lp(0, wrapC, 1f)
        )
        tabRow.addView(TextView(this).apply {
            text = "+"
            textSize = 26f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(dp(16), 0, dp(16), 0)
            setOnClickListener { addTab() }
        })
        root.addView(tabRow)

        // navigation row
        val nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(navBg)
            setPadding(dp(4), dp(8), dp(6), dp(8))
        }
        fun icon(label: String, action: () -> Unit) = TextView(this).apply {
            text = label
            textSize = 20f
            setTextColor(Color.WHITE)
            setPadding(dp(8), dp(6), dp(8), dp(6))
            setOnClickListener { action() }
        }
        nav.addView(icon("◀") { current()?.web?.let { if (it.canGoBack()) it.goBack() } })
        nav.addView(icon("▶") { current()?.web?.let { if (it.canGoForward()) it.goForward() } })
        nav.addView(icon("↻") { current()?.web?.reload() })
        nav.addView(icon("🏠") { loadHome() })

        engineBtn = chip("", bg, border) { showSearchEngines() }
        nav.addView(engineBtn, lp(wrapC, wrapC, 0f, 4, 0, 4, 0))

        address = field("").apply {
            textSize = 15f
            imeOptions = EditorInfo.IME_ACTION_GO
            setPadding(dp(14), dp(9), dp(14), dp(9))
            background = shape(bg, border, 14)
            setOnEditorActionListener { _, _, _ ->
                navigate(text.toString())
                true
            }
        }
        nav.addView(address, lp(0, wrapC, 1f, 2, 0, 2, 0))

        nav.addView(chip("Go", bg, border) { navigate(address.text.toString()) }, lp(wrapC, wrapC, 0f, 2, 0, 2, 0))
        wideBtn = chip("", wideOn, sky) { toggleWide() }
        nav.addView(wideBtn, lp(wrapC, wrapC, 0f, 2, 0, 0, 0))
        root.addView(nav)

        // page area + DexAI sidebar panel
        content = FrameLayout(this)
        root.addView(content, lp(matchP, 0, 1f))

        aiPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            setBackgroundColor(bg)
        }
        val aiBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(purpleBg)
            setPadding(dp(8), dp(6), dp(8), dp(6))
        }
        aiTitle = TextView(this).apply {
            textSize = 15f
            setTypeface(null, Typeface.BOLD)
            setTextColor(Color.WHITE)
            setPadding(dp(6), dp(6), dp(6), dp(6))
            setOnClickListener { chooseAi() }
        }
        aiBar.addView(aiTitle, lp(0, wrapC, 1f))
        aiBar.addView(TextView(this).apply {
            text = "✕"
            textSize = 18f
            setTextColor(Color.WHITE)
            setPadding(dp(12), dp(4), dp(12), dp(4))
            setOnClickListener { aiPanel.visibility = View.GONE }
        })
        aiPanel.addView(aiBar, lp(matchP, wrapC))
        val sidebar = aiWeb ?: createAiWeb().also { aiWeb = it }
        (sidebar.parent as? ViewGroup)?.removeView(sidebar)
        aiPanel.addView(sidebar, lp(matchP, 0, 1f))
        root.addView(aiPanel, lp(matchP, 0, 1f))

        updateEngineUi()
        updateToggles()

        if (tabs.isEmpty()) {
            activeTab = -1
            addTab()
        } else {
            renderTabs()
            showActiveTab()
        }
    }

    private fun createAiWeb(): WebView {
        val web = WebView(this)
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
        }
        web.webViewClient = WebViewClient()
        return web
    }

    private fun toggleAi() {
        if (aiPanel.visibility == View.VISIBLE) {
            aiPanel.visibility = View.GONE
        } else {
            openAi(prefs.getString("ai", "Perplexity AI") ?: "Perplexity AI")
        }
    }

    private fun openAi(name: String) {
        val site = aiSites[name] ?: aiSites.values.first()
        val web = aiWeb ?: createAiWeb().also { aiWeb = it }
        prefs.edit().putString("ai", name).apply()
        aiTitle.text = "✨ $name ▾"
        if (web.url != site) web.loadUrl(site)
        aiPanel.visibility = View.VISIBLE
    }

    private fun chooseAi() {
        val names = aiSites.keys.toTypedArray()
        dialog()
            .setTitle("DexAI Sidebar")
            .setItems(names) { _, index -> openAi(names[index]) }
            .show()
    }

    private fun engine(): String =
        prefs.getString("engine", "Google") ?: "Google"

    private fun updateEngineUi() {
        engineBtn.text = "🔍 ${engine()} ▾"
        address.hint = "Search ${engine()} or enter URL"
    }

    private fun updateToggles() {
        val pc = prefs.getBoolean("pcua", true)
        val wide = prefs.getBoolean("wide", true)
        uaLabel.text = if (pc) "•  Windows 11 — Chrome 131" else "•  Android — Mobile Chrome"
        uaBtn.alpha = if (pc) 1f else 0.55f
        wideBtn.text = "1366px: " + if (wide) "ON" else "OFF"
        wideBtn.background = shape(if (wide) wideOn else bg, if (wide) sky else border)
    }

    private fun applyView(web: WebView) {
        val pc = prefs.getBoolean("pcua", true)
        val wide = prefs.getBoolean("wide", true)
        web.settings.userAgentString = if (pc) desktopUA else mobileUA
        web.settings.useWideViewPort = wide
        web.settings.loadWithOverviewMode = wide
    }

    private fun refreshViews() {
        tabs.forEach { applyView(it.web) }
        updateToggles()
        current()?.let { if (it.start) loadStart(it.web) else it.web.reload() }
    }

    private fun togglePcUa() {
        prefs.edit().putBoolean("pcua", !prefs.getBoolean("pcua", true)).apply()
        refreshViews()
    }

    private fun toggleWide() {
        prefs.edit().putBoolean("wide", !prefs.getBoolean("wide", true)).apply()
        refreshViews()
    }

    // ---------- tabs ----------

    private fun homepage(): String =
        prefs.getString("homepage", "start") ?: "start"

    private fun current(): Tab? = tabs.getOrNull(activeTab)

    private fun loadStart(web: WebView) {
        web.loadDataWithBaseURL(
            "$startBase/",
            startPage.replace("__SEL__", engine()),
            "text/html",
            "UTF-8",
            null
        )
    }

    private fun loadHome() {
        val tab = current() ?: return
        val home = homepage()
        if (home == "start") {
            tab.start = true
            tab.title = "DexBrowse Start"
            loadStart(tab.web)
        } else {
            tab.web.loadUrl(home)
        }
    }

    private fun handleInternal(uri: Uri) {
        when (uri.host) {
            "ai" -> openAi(prefs.getString("ai", "Perplexity AI") ?: "Perplexity AI")
            "search" -> {
                val chosen = uri.getQueryParameter("e") ?: "Google"
                val query = uri.getQueryParameter("q") ?: return
                if (searchEngines.containsKey(chosen)) {
                    prefs.edit().putString("engine", chosen).apply()
                    updateEngineUi()
                }
                navigate(query)
            }
        }
    }

    private fun addTab(url: String? = null) {
        val web = WebView(this)

        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(true)
        }
        applyView(web)

        web.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message?
            ): Boolean = false

            override fun onReceivedTitle(view: WebView?, title: String?) {
                val tab = tabs.firstOrNull { it.web === view } ?: return
                if (!title.isNullOrBlank()) tab.title = title
                renderTabs()
            }
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                return request?.url?.toString()?.let {
                    blocker.intercept(it)
                }
            }

            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val uri = request?.url ?: return false
                return when (uri.scheme) {
                    "dexbrowse" -> {
                        handleInternal(uri)
                        true
                    }
                    "http", "https" -> false
                    else -> true
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val tab = tabs.firstOrNull { it.web === view } ?: return
                val page = url ?: return
                tab.start = page.startsWith(startBase)
                if (tab.start) {
                    tab.title = "DexBrowse Start"
                } else {
                    history.add(page)
                }
                renderTabs()
                if (tab === current()) {
                    address.setText(if (tab.start) "" else page)
                }
            }
        }

        val tab = Tab(web)
        tabs.add(tab)
        activeTab = tabs.lastIndex
        renderTabs()
        showActiveTab()

        if (url == null) {
            loadHome()
        } else {
            tab.start = false
            web.loadUrl(url)
        }
    }

    private fun closeTab(index: Int) {
        if (index !in tabs.indices) return
        val tab = tabs.removeAt(index)
        (tab.web.parent as? ViewGroup)?.removeView(tab.web)
        tab.web.destroy()
        if (tabs.isEmpty()) {
            activeTab = -1
            addTab()
            return
        }
        if (index < activeTab) activeTab--
        activeTab = activeTab.coerceIn(0, tabs.lastIndex)
        showActiveTab()
        renderTabs()
    }

    private fun showActiveTab() {
        val tab = current() ?: return
        content.removeAllViews()
        (tab.web.parent as? ViewGroup)?.removeView(tab.web)
        content.addView(
            tab.web,
            FrameLayout.LayoutParams(matchP, matchP)
        )
        address.setText(if (tab.start) "" else tab.web.url ?: "")
    }

    private fun renderTabs() {
        if (!::tabStrip.isInitialized) return
        tabStrip.removeAllViews()
        tabs.forEachIndexed { index, tab ->
            val active = index == activeTab
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
                setPadding(dp(14), dp(9), dp(8), dp(9))
                background = shape(
                    if (active) bg else panel,
                    if (active) sky else border,
                    14
                )
                setOnClickListener {
                    activeTab = index
                    showActiveTab()
                    renderTabs()
                }
            }
            row.addView(TextView(this).apply {
                text = tab.title
                textSize = 15f
                setTextColor(Color.WHITE)
                setSingleLine(true)
                ellipsize = TextUtils.TruncateAt.END
                maxWidth = dp(150)
            })
            row.addView(TextView(this).apply {
                text = "✕"
                textSize = 16f
                setTextColor(Color.parseColor("#F87171"))
                setPadding(dp(10), dp(2), dp(4), dp(2))
                setOnClickListener { closeTab(index) }
            })
            tabStrip.addView(row, lp(wrapC, wrapC, 0f, 0, 0, 8, 0))
        }
    }

    private fun navigate(value: String) {
        val text = value.trim()
        if (text.isBlank()) return
        val tab = current() ?: return

        val url = when {
            text.startsWith("https://") -> text
            text.startsWith("http://") -> text
            text.contains(".") && !text.contains(" ") -> "https://$text"
            else -> {
                val base = searchEngines[engine()] ?: searchEngines["Google"]!!
                base + Uri.encode(text)
            }
        }
        tab.start = false
        tab.web.loadUrl(url)
    }

    // ---------- settings (tap the "DexBrowse By Fuad" title) ----------

    private fun showHistory() {
        val items = history.getAll()
        dialog()
            .setTitle("Browsing History")
            .setItems(items.toTypedArray()) { _, index ->
                navigate(items[index])
            }
            .setPositiveButton("Clear") { _, _ ->
                dialog()
                    .setTitle("Clear history?")
                    .setPositiveButton("Clear") { _, _ ->
                        history.clear()
                    }
                    .setNegativeButton("Cancel", null)
                    .show()
            }
            .setNegativeButton("Close", null)
            .show()
    }

    private fun showSettings() {
        val options = arrayOf(
            "History",
            "Search Engine",
            "Ad Blocking: " + if (blocker.enabled) "ON" else "OFF",
            "Homepage",
            "Password & Lock",
            "Forget Saved Password",
            "About DexBrowse"
        )

        dialog()
            .setTitle("DexBrowse Settings")
            .setItems(options) { _, index ->
                when (index) {
                    0 -> showHistory()
                    1 -> showSearchEngines()
                    2 -> toggleAdBlock()
                    3 -> changeHomepage()
                    4 -> configureProtection()
                    5 -> {
                        vault.clear()
                        toast("Saved password removed")
                    }
                    6 -> showAbout()
                }
            }
            .show()
    }

    private fun showSearchEngines() {
        val names = searchEngines.keys.toTypedArray()
        dialog()
            .setTitle("Choose Search Engine")
            .setItems(names) { _, index ->
                prefs.edit()
                    .putString("engine", names[index])
                    .apply()
                updateEngineUi()
                current()?.let { if (it.start) loadStart(it.web) }
            }
            .show()
    }

    private fun toggleAdBlock() {
        blocker.enabled = !blocker.enabled
        prefs.edit()
            .putBoolean("adblock", blocker.enabled)
            .apply()
        toast(if (blocker.enabled) "Ad blocking enabled" else "Ad blocking disabled")
    }

    private fun changeHomepage() {
        val input = field("Homepage URL (empty = DexBrowse Start)")
        input.setText(if (homepage() == "start") "" else homepage())
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
            addView(input)
        }

        dialog()
            .setTitle("Homepage")
            .setView(box)
            .setPositiveButton("Save") { _, _ ->
                val url = input.text.toString().trim()
                when {
                    url.isEmpty() ->
                        prefs.edit().putString("homepage", "start").apply()
                    url.startsWith("https://") ->
                        prefs.edit().putString("homepage", url).apply()
                    else -> toast("Homepage must start with https://")
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun configureProtection() {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
        }

        val username = field("Username")
        val password = field("Password (8+ characters)", true)
        val recovery = field("Recovery Phrase (12+ characters)", true)
        val remember = CheckBox(this).apply {
            text = "Remember password on this device"
            setTextColor(Color.WHITE)
            buttonTintList = ColorStateList.valueOf(sky)
            isChecked = vault.isRemembered()
        }

        box.addView(username)
        box.addView(password)
        box.addView(recovery)
        box.addView(remember)

        dialog()
            .setTitle(if (security.isProtected()) "Change Password" else "Enable Password Protection")
            .setView(box)
            .setPositiveButton("Save") { _, _ ->
                try {
                    security.configure(
                        username.text.toString(),
                        password.text.toString(),
                        recovery.text.toString()
                    )
                    if (remember.isChecked) {
                        vault.save(password.text.toString())
                    } else {
                        vault.clear()
                    }
                    toast("Protection enabled")
                } catch (_: IllegalArgumentException) {
                    toast("Check username, password and recovery phrase", true)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showAbout() {
        dialog()
            .setTitle("About DexBrowse")
            .setMessage(
                "DexBrowse\n\n" +
                    "Version: ${BuildConfig.VERSION_NAME}\n" +
                    "Version Code: ${BuildConfig.VERSION_CODE}\n\n" +
                    "Developer: Md. Fuad Hasan\n" +
                    "Brand: DexBrowse By Fuad\n\n" +
                    "Android Desktop Browser"
            )
            .setPositiveButton("OK", null)
            .show()
    }

    // ---------- remote config / kill switch ----------

    private fun checkRemoteConfig() {
        executor.execute {
            try {
                val connection = URL(BuildConfig.CONFIG_URL)
                    .openConnection()
                connection.connectTimeout = 8000
                connection.readTimeout = 8000
                connection.useCaches = false

                val json = connection.getInputStream()
                    .bufferedReader()
                    .use { it.readText() }

                val config = JSONObject(json)
                killed = config.optBoolean("kill_switch", false)
                minVersion = config.optInt("min_version_code", 1)
                updateUrl = config.optString("update_url", "")

                handler.post {
                    if (killed) {
                        showBlocked("DexBrowse has been disabled")
                    } else if (BuildConfig.VERSION_CODE < minVersion) {
                        showBlocked("Update Required")
                    }
                }
            } catch (_: Exception) {
                // Network failure: current local session continues.
            }
        }
    }

    private fun showBlocked(message: String) {
        browserVisible = false
        root.removeAllViews()
        root.gravity = Gravity.CENTER

        root.addView(TextView(this).apply {
            text = message
            textSize = 24f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(dp(24), dp(24), dp(24), dp(24))
        })

        if (!killed && updateUrl.startsWith("https://")) {
            root.addView(
                chip("Download Update", blue, sky) {
                    startActivity(
                        Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse(updateUrl)
                        )
                    )
                },
                lp(wrapC, wrapC, 0f, 24, 0, 24, 0)
            )
        }
    }

    // ---------- lifecycle ----------

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        if (browserVisible) {
            val ai = aiWeb
            if (::aiPanel.isInitialized &&
                aiPanel.visibility == View.VISIBLE &&
                ai != null && ai.canGoBack()
            ) {
                ai.goBack()
                return
            }
            val tab = current()
            if (tab != null && tab.web.canGoBack()) {
                tab.web.goBack()
                return
            }
        }
        super.onBackPressed()
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        if (::security.isInitialized) {
            checkRemoteConfig()
        }
    }

    override fun onDestroy() {
        tabs.forEach { it.web.destroy() }
        aiWeb?.destroy()
        executor.shutdownNow()
        super.onDestroy()
    }
}
''')

# ---------------------------------------------------------------------------
# One-time signing key. Created ONLY if it does not exist yet, so re-running
# this script never changes the key. COMMIT keystore/dexbrowse.jks (or restore
# it in CI) so every future build is signed with the same key and installs
# cleanly over the previous version.
# ---------------------------------------------------------------------------
keystore = Path("keystore/dexbrowse.jks")
if keystore.exists():
    print("Keystore found - keeping it (updates will install over old builds)")
else:
    keystore.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [
                "keytool", "-genkeypair", "-v",
                "-keystore", str(keystore),
                "-alias", "dexbrowse",
                "-keyalg", "RSA", "-keysize", "2048",
                "-validity", "36500",
                "-storepass", "dexbrowse123",
                "-keypass", "dexbrowse123",
                "-dname", "CN=DexBrowse By Fuad, O=Fuad, C=BD",
            ],
            check=True,
        )
        print("Created:", keystore, "-> COMMIT THIS FILE so updates stay installable")
    except Exception as error:
        print("WARNING: could not create keystore (is a JDK installed?):", error)
        print("Run keytool manually or the release build will fail.")
