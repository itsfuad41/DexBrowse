from pathlib import Path
import textwrap

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
        versionCode = 5
        versionName = "2.2.0"

        buildConfigField(
            "String",
            "CONFIG_URL",
            "\\"https://raw.githubusercontent.com/itsfuad41/DexBrowse/main/config.json\\""
        )
    }

    buildFeatures {
        buildConfig = true
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
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
        parent="android:style/Theme.Material.Light.NoActionBar">

        <item name="android:statusBarColor">#0B1220</item>
        <item name="android:navigationBarColor">#0B1220</item>
        <item name="android:windowLightStatusBar">false</item>

    </style>
</resources>
""")


write("app/src/main/res/drawable/ic_launcher.xml", """
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
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
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {

    private lateinit var security: SecurityManager
    private lateinit var history: HistoryManager

    private val blocker = AdBlockManager()

    private lateinit var root: LinearLayout
    private lateinit var content: LinearLayout
    private lateinit var address: EditText
    private lateinit var tabStrip: LinearLayout

    private val tabs = mutableListOf<WebView>()
    private var activeTab = -1

    private var killed = false
    private var minVersion = 1
    private var updateUrl = ""

    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()

    private val prefs by lazy {
        getSharedPreferences("dexbrowse_settings", MODE_PRIVATE)
    }

    private val desktopUA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/131.0.0.0 Safari/537.36"

    private val searchEngines = linkedMapOf(
        "Google" to "https://www.google.com/search?q=",
        "Bing" to "https://www.bing.com/search?q=",
        "DuckDuckGo" to "https://duckduckgo.com/?q=",
        "Brave" to "https://search.brave.com/search?q=",
        "Perplexity" to "https://www.perplexity.ai/search?q="
    )

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        security = SecurityManager(this)
        history = HistoryManager(this)

        blocker.enabled = prefs.getBoolean("adblock", true)

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(15, 23, 42))
        }

        setContentView(root)

        if (security.isProtected()) {
            showLock()
        } else {
            showBrowser()
        }

        checkRemoteConfig()
    }

    private fun button(
        label: String,
        action: () -> Unit
    ): Button {
        return Button(this).apply {
            text = label
            setOnClickListener { action() }
        }
    }

    private fun input(
        hintText: String,
        secret: Boolean = false
    ): EditText {
        return EditText(this).apply {
            hint = hintText
            setTextColor(Color.WHITE)
            setHintTextColor(Color.LTGRAY)

            if (secret) {
                inputType = InputType.TYPE_CLASS_TEXT or
                    InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
        }
    }

    private fun showLock() {
        root.removeAllViews()

        root.addView(TextView(this).apply {
            text = "Hello, ${security.username()}"
            textSize = 26f
            setTextColor(Color.WHITE)
            setPadding(25, 100, 25, 35)
        })

        val password = input("Device Password", true)
        root.addView(password)

        root.addView(button("UNLOCK DEXBROWSE") {
            if (security.verifyPassword(password.text.toString())) {
                showBrowser()
            } else {
                password.setText("")
                Toast.makeText(
                    this,
                    "Incorrect password",
                    Toast.LENGTH_SHORT
                ).show()
            }
        })

        root.addView(button("Forgot Password") {
            showRecovery()
        })
    }

    private fun showRecovery() {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        val phrase = input("Recovery Phrase", true)
        val password = input("New Password", true)

        box.addView(phrase)
        box.addView(password)

        AlertDialog.Builder(this)
            .setTitle("Recover DexBrowse")
            .setView(box)
            .setPositiveButton("Reset") { _, _ ->
                if (
                    security.verifyRecovery(phrase.text.toString()) &&
                    password.text.length >= 8
                ) {
                    security.resetPassword(password.text.toString())
                    Toast.makeText(
                        this,
                        "Password updated",
                        Toast.LENGTH_SHORT
                    ).show()
                } else {
                    Toast.makeText(
                        this,
                        "Recovery failed",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showBrowser() {
        root.removeAllViews()

        val title = TextView(this).apply {
            text = "DexBrowse  •  By Fuad"
            textSize = 19f
            setTextColor(Color.rgb(56, 189, 248))
            setPadding(18, 12, 18, 12)
        }

        root.addView(title)

        val toolbar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }

        toolbar.addView(button("◀") {
            current()?.let {
                if (it.canGoBack()) it.goBack()
            }
        })

        toolbar.addView(button("▶") {
            current()?.let {
                if (it.canGoForward()) it.goForward()
            }
        })

        toolbar.addView(button("⌂") {
            current()?.loadUrl(homepage())
        })

        toolbar.addView(button("+") {
            addTab(homepage())
        })

        toolbar.addView(button("⋮") {
            showSettings()
        })

        root.addView(HorizontalScrollView(this).apply {
            addView(toolbar)
        })

        tabStrip = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }

        root.addView(HorizontalScrollView(this).apply {
            addView(tabStrip)
        })

        val nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
        }

        address = input("Search or enter website").apply {
            setSingleLine(true)
            layoutParams = LinearLayout.LayoutParams(0, -2, 1f)
        }

        nav.addView(address)

        nav.addView(button("Go") {
            navigate(address.text.toString())
        })

        root.addView(nav)

        content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        root.addView(
            content,
            LinearLayout.LayoutParams(-1, 0, 1f)
        )

        tabs.clear()
        activeTab = -1

        addTab(homepage())
    }

    private fun homepage(): String =
        prefs.getString(
            "homepage",
            "https://www.google.com"
        ) ?: "https://www.google.com"

    private fun current(): WebView? =
        tabs.getOrNull(activeTab)

    private fun addTab(url: String) {
        val webView = WebView(this)

        CookieManager.getInstance().setAcceptCookie(true)

        CookieManager.getInstance().setAcceptThirdPartyCookies(
            webView,
            false
        )

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            userAgentString = desktopUA
            useWideViewPort = true
            loadWithOverviewMode = true
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(true)
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message?
            ): Boolean = false
        }

        webView.webViewClient = object : WebViewClient() {

            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                return request?.url?.toString()?.let {
                    blocker.intercept(it)
                }
            }

            override fun onPageFinished(
                view: WebView,
                url: String
            ) {
                super.onPageFinished(view, url)

                history.add(url)

                if (tabs.indexOf(view) == activeTab) {
                    address.setText(url)
                }
            }
        }

        tabs.add(webView)
        activeTab = tabs.lastIndex

        renderTabs()
        showActiveTab()
        webView.loadUrl(url)
    }

    private fun showActiveTab() {
        val view = current() ?: return

        content.removeAllViews()

        (view.parent as? ViewGroup)?.removeView(view)

        content.addView(
            view,
            LinearLayout.LayoutParams(-1, -1)
        )

        address.setText(view.url ?: "")
    }

    private fun renderTabs() {
        tabStrip.removeAllViews()

        tabs.forEachIndexed { index, _ ->
            tabStrip.addView(button("Tab ${index + 1}") {
                activeTab = index
                showActiveTab()
            })
        }
    }

    private fun navigate(value: String) {
        val text = value.trim()
        if (text.isBlank()) return

        val url = when {
            text.startsWith("https://") -> text
            text.startsWith("http://") -> text
            text.contains(".") && !text.contains(" ") ->
                "https://$text"

            else -> {
                val selected = prefs.getString(
                    "engine",
                    "Google"
                ) ?: "Google"

                val base = searchEngines[selected]
                    ?: searchEngines["Google"]!!

                base + Uri.encode(text)
            }
        }

        current()?.loadUrl(url)
    }

    private fun showHistory() {
        val items = history.getAll()

        AlertDialog.Builder(this)
            .setTitle("Browsing History")
            .setItems(items.toTypedArray()) { _, index ->
                navigate(items[index])
            }
            .setPositiveButton("Clear") { _, _ ->
                AlertDialog.Builder(this)
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
            "Ad Blocking",
            "Homepage",
            "Password Protection",
            "About DexBrowse"
        )

        AlertDialog.Builder(this)
            .setTitle("DexBrowse Settings")
            .setItems(options) { _, index ->
                when (index) {
                    0 -> showHistory()
                    1 -> showSearchEngines()
                    2 -> toggleAdBlock()
                    3 -> changeHomepage()
                    4 -> configureProtection()
                    5 -> showAbout()
                }
            }
            .show()
    }

    private fun showSearchEngines() {
        val names = searchEngines.keys.toTypedArray()

        AlertDialog.Builder(this)
            .setTitle("Choose Search Engine")
            .setItems(names) { _, index ->
                prefs.edit()
                    .putString("engine", names[index])
                    .apply()
            }
            .show()
    }

    private fun toggleAdBlock() {
        blocker.enabled = !blocker.enabled

        prefs.edit()
            .putBoolean("adblock", blocker.enabled)
            .apply()

        Toast.makeText(
            this,
            if (blocker.enabled) "Ad blocking enabled"
            else "Ad blocking disabled",
            Toast.LENGTH_SHORT
        ).show()
    }

    private fun changeHomepage() {
        val field = input("Homepage URL")
        field.setText(homepage())

        AlertDialog.Builder(this)
            .setTitle("Homepage")
            .setView(field)
            .setPositiveButton("Save") { _, _ ->
                val url = field.text.toString()

                if (url.startsWith("https://")) {
                    prefs.edit()
                        .putString("homepage", url)
                        .apply()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun configureProtection() {
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        val username = input("Username")
        val password = input("Password (8+ characters)", true)
        val recovery = input("Recovery Phrase (12+ characters)", true)

        box.addView(username)
        box.addView(password)
        box.addView(recovery)

        AlertDialog.Builder(this)
            .setTitle("Enable Password Protection")
            .setView(box)
            .setPositiveButton("Save") { _, _ ->
                try {
                    security.configure(
                        username.text.toString(),
                        password.text.toString(),
                        recovery.text.toString()
                    )

                    Toast.makeText(
                        this,
                        "Protection enabled",
                        Toast.LENGTH_SHORT
                    ).show()

                } catch (_: IllegalArgumentException) {
                    Toast.makeText(
                        this,
                        "Check username, password and recovery phrase",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showAbout() {
        AlertDialog.Builder(this)
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
        root.removeAllViews()

        root.addView(TextView(this).apply {
            text = message
            textSize = 24f
            setTextColor(Color.WHITE)
            setPadding(30, 100, 30, 30)
        })

        if (!killed && updateUrl.startsWith("https://")) {
            root.addView(button("Download Update") {
                startActivity(
                    Intent(
                        Intent.ACTION_VIEW,
                        Uri.parse(updateUrl)
                    )
                )
            })
        }
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
        tabs.forEach { it.destroy() }
        executor.shutdownNow()
        super.onDestroy()
    }
}
''')


write("config.json", """
{
  "kill_switch": false,
  "kill_message": "DexBrowse has been disabled by Fuad.",
  "min_version_code": 5,
  "latest_version": "2.2.0",
  "update_url": "https://github.com/itsfuad41/DexBrowse/releases/latest"
}
""")


write("README.md", """
# DexBrowse

DexBrowse is a desktop-style Android browser.

**By Fuad**

## Version

2.2.0

## Developer

Md. Fuad Hasan

## Features

- Desktop Windows User-Agent
- Multiple tabs
- Browsing history
- Persistent website cookies
- Optional password protection
- Password recovery phrase
- Basic ad and popup blocking
- Search engine selection
- GitHub remote configuration
- GitHub Actions APK builds

## Build

Upload generate_project.py and the GitHub Actions workflow.

GitHub Actions generates the Android project and builds an APK.

## Note

This is a starter implementation. Secure credential autofill,
encrypted cloud backups, and isolated guest profiles are not yet implemented.
""")


print()
print("DexBrowse v2.2 project generated successfully.")
print("Application name: DexBrowse")
print("Developer: Md. Fuad Hasan")
print("Version: 2.2.0")
