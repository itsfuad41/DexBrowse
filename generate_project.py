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
        versionCode = 23
        versionName = "2.12.0"

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

dependencies {
    implementation("androidx.webkit:webkit:1.18.0")
}
""")

write("app/src/main/AndroidManifest.xml", """
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

    <!-- Chromium capabilities: camera / microphone (WebRTC), location, downloads -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission
        android:name="android.permission.WRITE_EXTERNAL_STORAGE"
        android:maxSdkVersion="28" />

    <uses-feature android:name="android.hardware.camera" android:required="false" />
    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />
    <uses-feature android:name="android.hardware.location" android:required="false" />

    <application
        android:allowBackup="false"
        android:hardwareAccelerated="true"
        android:icon="@drawable/ic_launcher"
        android:label="DexBrowse"
        android:theme="@style/Theme.DexBrowse"
        android:usesCleartextTraffic="false">

        <meta-data
            android:name="android.webkit.WebView.EnableSafeBrowsing"
            android:value="true" />

        <activity
            android:name="com.fuad.dexbrowse.MainActivity"
            android:exported="true"
            android:hardwareAccelerated="true"
            android:configChanges="orientation|screenSize|keyboardHidden|screenLayout|smallestScreenSize|uiMode"
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

    data class Profile(val id: String, val name: String)

    companion object {
        const val DEFAULT_PROFILE_ID = "Default"
    }

    init {
        migrateLegacyProfile()
    }

    private fun profileIds(): MutableList<String> {
        val ids = prefs.getString("profile_ids", null)
        if (ids != null) {
            return try {
                val array = org.json.JSONArray(ids)
                MutableList(array.length()) { array.getString(it) }
            } catch (_: org.json.JSONException) {
                mutableListOf()
            }
        }
        return mutableListOf()
    }

    private fun saveProfileIds(ids: List<String>) {
        prefs.edit()
            .putString("profile_ids", org.json.JSONArray(ids).toString())
            .apply()
    }

    private fun migrateLegacyProfile() {
        if (profileIds().isNotEmpty() || !prefs.contains("password_hash")) return
        val legacyKeys = arrayOf("password_salt", "password_hash", "recovery_salt", "recovery_hash")
        val editor = prefs.edit()
            .putString("profile_name.$DEFAULT_PROFILE_ID", prefs.getString("username", "Guest"))
        legacyKeys.forEach { key ->
            prefs.getString(key, null)?.let { editor.putString("$key.$DEFAULT_PROFILE_ID", it) }
        }
        editor.remove("username")
            .remove("password_salt")
            .remove("password_hash")
            .remove("recovery_salt")
            .remove("recovery_hash")
            .putString("profile_ids", org.json.JSONArray(listOf(DEFAULT_PROFILE_ID)).toString())
            .putString("active_profile", DEFAULT_PROFILE_ID)
            .apply()
    }

    fun profiles(): List<Profile> =
        profileIds().mapNotNull { id ->
            prefs.getString("profile_name.$id", null)?.let { Profile(id, it) }
        }

    fun activeProfileId(): String =
        prefs.getString("active_profile", DEFAULT_PROFILE_ID) ?: DEFAULT_PROFILE_ID

    fun setActiveProfile(id: String) {
        require(profileIds().contains(id)) { "Profile does not exist" }
        prefs.edit().putString("active_profile", id).apply()
    }

    fun isProtected(profileId: String = activeProfileId()): Boolean =
        prefs.contains("password_hash.$profileId")

    fun username(profileId: String = activeProfileId()): String =
        prefs.getString("profile_name.$profileId", "Guest") ?: "Guest"

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

    private fun saveSecret(profileId: String, key: String, value: String) {
        val salt = ByteArray(16)
        SecureRandom().nextBytes(salt)
        prefs.edit()
            .putString(
                "$key" + "_salt.$profileId",
                Base64.encodeToString(salt, Base64.NO_WRAP)
            )
            .putString(
                "$key" + "_hash.$profileId",
                Base64.encodeToString(
                    derive(value, salt),
                    Base64.NO_WRAP
                )
            )
            .apply()
    }

    private fun verifySecret(profileId: String, key: String, value: String): Boolean {
        return try {
            val salt = Base64.decode(
                prefs.getString("$key" + "_salt.$profileId", "") ?: "",
                Base64.NO_WRAP
            )
            val expected = Base64.decode(
                prefs.getString("$key" + "_hash.$profileId", "") ?: "",
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

    fun createProfile(
        name: String,
        password: String,
        recovery: String
    ): String {
        require(name.isNotBlank())
        require(password.isNotBlank())
        require(isPasswordUnique(password)) { "Passcode is already used by another profile" }
        val ids = profileIds()
        val id = if (ids.isEmpty()) {
            DEFAULT_PROFILE_ID
        } else {
            "profile_${java.util.UUID.randomUUID().toString().replace("-", "")}"
        }
        ids.add(id)
        prefs.edit()
            .putString("profile_name.$id", name.trim().take(60))
            .apply()
        saveSecret(id, "password", password)
        if (recovery.isNotBlank()) saveSecret(id, "recovery", recovery)
        saveProfileIds(ids)
        return id
    }

    fun configure(name: String, password: String, recovery: String) {
        val id = activeProfileId()
        require(profileIds().contains(id))
        require(name.isNotBlank())
        require(password.isNotBlank())
        require(isPasswordUnique(password, id)) { "Passcode is already used by another profile" }
        prefs.edit().putString("profile_name.$id", name.trim().take(60)).apply()
        saveSecret(id, "password", password)
        if (recovery.isNotBlank()) {
            saveSecret(id, "recovery", recovery)
        }
    }

    fun hasRecovery(profileId: String = activeProfileId()): Boolean =
        prefs.contains("recovery_hash.$profileId")

    fun verifyPassword(value: String, profileId: String = activeProfileId()): Boolean =
        verifySecret(profileId, "password", value)

    fun isPasswordUnique(value: String, exceptProfileId: String? = null): Boolean =
        profiles().none { profile ->
            profile.id != exceptProfileId && verifyPassword(value, profile.id)
        }

    fun verifyRecovery(value: String, profileId: String = activeProfileId()): Boolean =
        verifySecret(profileId, "recovery", value)

    fun resetPassword(value: String, profileId: String = activeProfileId()) {
        require(value.isNotBlank())
        require(isPasswordUnique(value, profileId)) { "Passcode is already used by another profile" }
        saveSecret(profileId, "password", value)
    }

    fun deleteProfile(id: String): Boolean {
        val ids = profileIds()
        if (ids.size <= 1 || id !in ids) return false
        val remaining = ids.filterNot { it == id }
        val editor = prefs.edit()
        prefs.all.keys
            .filter { it == "profile_name.$id" || it.endsWith(".$id") }
            .forEach(editor::remove)
        editor.putString("profile_ids", org.json.JSONArray(remaining).toString())
        if (activeProfileId() == id) {
            editor.putString("active_profile", remaining.first())
        }
        editor.apply()
        return true
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

class HistoryManager(context: Context, profileId: String = "Default") {

    private val prefs = context.getSharedPreferences(
        if (profileId == "Default") "dexbrowse_history" else "dexbrowse_history_$profileId",
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

write("app/src/main/java/com/fuad/dexbrowse/CredentialVault.kt", """
package com.fuad.dexbrowse

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class CredentialVault(context: Context, profileId: String = "Default") {

    data class Credential(val username: String, val password: String)

    private val prefs = context.getSharedPreferences(
        if (profileId == "Default") "dexbrowse_credentials" else "dexbrowse_credentials_$profileId",
        Context.MODE_PRIVATE
    )
    private val alias =
        if (profileId == "Default") "dexbrowse_credentials_key"
        else "dexbrowse_credentials_key_$profileId"

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

    private fun entries(): JSONObject {
        val ivText = prefs.getString("iv", null) ?: return JSONObject()
        val blobText = prefs.getString("blob", null) ?: return JSONObject()
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            key(),
            GCMParameterSpec(128, Base64.decode(ivText, Base64.NO_WRAP))
        )
        return JSONObject(
            String(
                cipher.doFinal(Base64.decode(blobText, Base64.NO_WRAP)),
                Charsets.UTF_8
            )
        )
    }

    private fun saveEntries(entries: JSONObject) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val blob = cipher.doFinal(entries.toString().toByteArray(Charsets.UTF_8))
        prefs.edit()
            .putString("iv", Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .putString("blob", Base64.encodeToString(blob, Base64.NO_WRAP))
            .apply()
    }

    @Synchronized
    fun save(origin: String, username: String, password: String) {
        require(origin.startsWith("https://"))
        require(username.isNotBlank() && password.isNotBlank())
        val entries = entries()
        entries.put(
            origin,
            JSONObject()
                .put("username", username)
                .put("password", password)
        )
        saveEntries(entries)
    }

    @Synchronized
    fun saveIfChanged(origin: String, username: String, password: String): Boolean {
        require(origin.startsWith("https://"))
        require(username.isNotBlank() && password.isNotBlank())
        val entries = entries()
        val existing = entries.optJSONObject(origin)
        if (
            existing?.optString("username") == username &&
            existing?.optString("password") == password
        ) {
            return false
        }
        entries.put(
            origin,
            JSONObject()
                .put("username", username)
                .put("password", password)
        )
        saveEntries(entries)
        return true
    }

    @Synchronized
    fun get(origin: String): Credential? {
        val entry = entries().optJSONObject(origin) ?: return null
        val username = entry.optString("username")
        val password = entry.optString("password")
        if (username.isBlank() || password.isBlank()) return null
        return Credential(username, password)
    }

    @Synchronized
    fun origins(): List<Pair<String, String>> {
        val entries = entries()
        return entries.keys().asSequence()
            .map { it to entries.optJSONObject(it)?.optString("username").orEmpty() }
            .toList()
    }

    @Synchronized
    fun remove(origin: String) {
        val entries = entries()
        entries.remove(origin)
        if (entries.length() == 0) {
            prefs.edit().clear().apply()
        } else {
            saveEntries(entries)
        }
    }

    @Synchronized
    fun clear() {
        prefs.edit().clear().apply()
    }

    fun deleteProfileData() {
        prefs.edit().clear().apply()
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        if (store.containsAlias(alias)) store.deleteEntry(alias)
    }
}
""")

write("app/src/main/java/com/fuad/dexbrowse/MainActivity.kt", r'''
package com.fuad.dexbrowse

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.app.DownloadManager
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Environment
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import androidx.webkit.WebSettingsCompat
import android.content.res.ColorStateList
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.text.InputType
import android.text.TextUtils
import android.view.Gravity
import android.view.ScaleGestureDetector
import android.view.View
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.view.inputmethod.InputMethodManager
import android.view.inputmethod.EditorInfo
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebResourceError
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.CheckBox
import android.widget.ArrayAdapter
import android.widget.AutoCompleteTextView
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import android.graphics.Typeface
import androidx.webkit.ProfileStore
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import org.json.JSONObject
import java.io.File
import java.security.MessageDigest
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {

    private class Tab(
        val web: WebView,
        var title: String = "DexBrowse Start",
        var start: Boolean = true,
        var zoom: Int = 100,
        var autofillPromptedOrigin: String? = null,
        var lastOnlineUrl: String? = null,
        var isOfflinePage: Boolean = false,
        var offlineFallbackAttempted: Boolean = false,
        var restoreScrollY: Int = 0
    )

    private val isLightTheme: Boolean
        get() = prefs.getString("theme", "dark") == "light"

    private val bg: Int
        get() = Color.parseColor(if (isLightTheme) "#F8FAFC" else "#0B1220")
    private val panel: Int
        get() = Color.parseColor(if (isLightTheme) "#E2E8F0" else "#1E293B")
    private val navBg: Int
        get() = Color.parseColor(if (isLightTheme) "#CBD5E1" else "#27354B")
    private val border: Int
        get() = Color.parseColor(if (isLightTheme) "#94A3B8" else "#3B4A63")
    private val sky: Int
        get() = Color.parseColor(if (isLightTheme) "#0369A1" else "#38BDF8")
    private val blue = Color.parseColor("#0284C7")
    private val wideOn = Color.parseColor("#0C6BA5")
    private val purpleBg: Int
        get() = Color.parseColor(if (isLightTheme) "#EDE9FE" else "#3B1F6E")
    private val purple: Int
        get() = Color.parseColor(if (isLightTheme) "#6D28D9" else "#8B5CF6")
    private val muted: Int
        get() = Color.parseColor(if (isLightTheme) "#475569" else "#94A3B8")
    private val foregroundColor: Int
        get() = Color.parseColor(if (isLightTheme) "#0F172A" else "#FFFFFF")

    private val matchP = ViewGroup.LayoutParams.MATCH_PARENT
    private val wrapC = ViewGroup.LayoutParams.WRAP_CONTENT

    private lateinit var security: SecurityManager
    private lateinit var history: HistoryManager
    private lateinit var credentialVault: CredentialVault
    private val blocker = AdBlockManager()

    private lateinit var root: LinearLayout
    private lateinit var content: FrameLayout
    private lateinit var address: AutoCompleteTextView
    private lateinit var addressAdapter: ArrayAdapter<String>
    private lateinit var tabCountButton: TextView
    private lateinit var tabsButton: FrameLayout
    private lateinit var aiPanel: LinearLayout
    private lateinit var aiTitle: TextView
    private var aiWeb: WebView? = null

    // Chromium capability state (file chooser, permissions, fullscreen, downloads)
    private val reqFileChooser = 7101
    private val reqWebPermissions = 7102
    private val reqGeolocation = 7103
    private val reqStorage = 7104
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null
    private var pendingWebPermission: PermissionRequest? = null
    private var pendingGeoOrigin: String? = null
    private var pendingGeoCallback: GeolocationPermissions.Callback? = null
    private var pendingDownload: Array<String?>? = null
    private var customView: View? = null
    private var customViewCallback: WebChromeClient.CustomViewCallback? = null
    private var externalFlowInProgress = false

    private val tabs = mutableListOf<Tab>()
    private var activeTab = -1
    private var browserVisible = false
    private var restoringSession = false
    private var loginMessage: String? = null
    private var wrongPasscodeAttempts = 0
    private var guestMode = false
    private var guestProfileId: String? = null
    private val reusableGuestProfileId = "DexBrowseGuestDemo"
    private val guestProfileRetentionMillis = 7L * 24 * 60 * 60 * 1000
    private var guestUsageRecordedAt = 0L

    private var killed = false
    private var minVersion = 1
    private var updateUrl = ""

    private val handler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor()
    private var lockRunnable: Runnable? = null
    private var lastInteractionAt = 0L

    private val prefs: android.content.SharedPreferences
        get() {
        guestProfileId?.takeIf { guestMode }?.let { id ->
            return getSharedPreferences("dexbrowse_guest_settings_$id", MODE_PRIVATE)
        }
        val profileId = security.activeProfileId()
        val name = if (profileId == SecurityManager.DEFAULT_PROFILE_ID) {
            "dexbrowse_settings"
        } else {
            "dexbrowse_settings_$profileId"
        }
        return getSharedPreferences(name, MODE_PRIVATE)
    }

    private val startBase = "https://dexbrowse.local"

    // The real Chromium major version of the installed WebView engine, so the
    // desktop user agent always matches the engine that is actually running.
    private val chromiumMajor: String = detectChromiumMajor()

    private fun detectChromiumMajor(): String {
        val raw = try {
            WebView.getCurrentWebViewPackage()?.versionName
        } catch (_: Throwable) {
            null
        }
        val major = raw?.substringBefore('.')
        return if (major != null && major.isNotEmpty() && major.all { it.isDigit() }) {
            major
        } else {
            "131"
        }
    }

    private val desktopUA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
            "AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/${chromiumMajor}.0.0.0 Safari/537.36"

    private val userAgents = linkedMapOf(
        "Windows 10/11 · Chrome" to desktopUA,
        "Windows 11 · Edge" to
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/${chromiumMajor}.0.0.0 Safari/537.36 Edg/${chromiumMajor}.0.0.0",
        "Windows 10/11 · Firefox" to
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) " +
                "Gecko/20100101 Firefox/133.0",
        "Windows 10/11 · Opera" to
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/${chromiumMajor}.0.0.0 Safari/537.36 OPR/115.0.0.0",
        "Windows 10/11 · Vivaldi" to
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/${chromiumMajor}.0.0.0 Safari/537.36 Vivaldi/7.0",
        "Windows 7 · Chrome" to
            "Mozilla/5.0 (Windows NT 6.1; Win64; x64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/109.0.0.0 Safari/537.36",
        "Mac · Chrome" to
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/${chromiumMajor}.0.0.0 Safari/537.36",
        "Mac · Firefox" to
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:133.0) " +
                "Gecko/20100101 Firefox/133.0",
        "Mac · Edge" to
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/${chromiumMajor}.0.0.0 Safari/537.36 Edg/${chromiumMajor}.0.0.0",
        "Linux · Chrome" to
            "Mozilla/5.0 (X11; Linux x86_64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/${chromiumMajor}.0.0.0 Safari/537.36",
        "Linux · Firefox" to
            "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) " +
                "Gecko/20100101 Firefox/133.0",
        "Ubuntu · Chromium" to
            "Mozilla/5.0 (X11; Ubuntu; Linux x86_64) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) Ubuntu " +
                "Chromium/${chromiumMajor}.0.0.0 Chrome/${chromiumMajor}.0.0.0 Safari/537.36",
        "ChromeOS · Chrome" to
            "Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "Chrome/${chromiumMajor}.0.0.0 Safari/537.36",
        "Mac · Safari" to
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
        "iPhone · iOS Safari" to
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 " +
                "Mobile/15E148 Safari/604.1",
        "iPad · iPadOS Safari" to
            "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) " +
                "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 " +
                "Mobile/15E148 Safari/604.1",
        "iPhone · Chrome" to
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) " +
                "AppleWebKit/605.1.15 (KHTML, like Gecko) " +
                "CriOS/${chromiumMajor}.0.0.0 Mobile/15E148 Safari/604.1",
        "Android · Firefox" to
            "Mozilla/5.0 (Android 14; Mobile; rv:133.0) Gecko/133.0 Firefox/133.0",
        "Android · Samsung Internet" to
            "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) " +
                "AppleWebKit/537.36 (KHTML, like Gecko) " +
                "SamsungBrowser/26.0 Chrome/${chromiumMajor}.0.0.0 Mobile Safari/537.36",
        "Android · Default" to ""
    )

    // Chrome-style mobile UA: drop the WebView-only markers ("; wv", "Version/4.0")
    // so sites treat DexBrowse like regular Chrome for Android.
    private val mobileUA by lazy {
        WebSettings.getDefaultUserAgent(this)
            .replace("; wv", "")
            .replace(" Version/4.0", "")
    }

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

    private val startPage = """
<!doctype html><html><head><meta charset="utf-8"><title>DexBrowse Start</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--page);font-family:Arial,sans-serif;color:var(--text);padding:24px 18px}
body.dark{--page:#0b1220;--text:#e2e8f0;--sub:#94a3b8;--input:#172338;--line:#334155;--card:#111c2d}
body.light{--page:#f1f5f9;--text:#0f172a;--sub:#475569;--input:#fff;--line:#cbd5e1;--card:#fff}
.box{width:min(520px,100%);text-align:center;padding:28px 20px;background:var(--card);border:1px solid var(--line);border-radius:22px;box-shadow:0 16px 48px #0003}
h1{margin:0;font-size:28px;color:#38bdf8}
.subtitle{margin:8px 0 6px;font-size:14px;color:var(--sub)}
.greeting{margin:0 0 22px;font-size:16px;color:var(--sub)}
.name{border:0;background:none;color:#38bdf8;font:inherit;font-weight:700;padding:0}
.engines{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:0 0 16px}
.engine{background:var(--input);color:var(--text);border:1px solid var(--line);border-radius:999px;padding:9px 13px;font-size:13px}
.engine.selected{background:#0284c7;border-color:#0284c7;color:#fff}
form{display:flex;gap:8px}
form input{flex:1;min-width:0;background:var(--input);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:14px;font-size:15px;outline:none}
form button,.shortcut{background:#0284c7;color:#fff;border:0;border-radius:12px;padding:0 18px;font-weight:600;font-size:14px}
.last{display:block;width:100%;margin-top:14px;background:var(--input);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:12px 16px;font-size:14px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.quick{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:20px}
.shortcut{min-height:44px;padding:10px;background:#24344b;border:1px solid var(--line)}
.shortcut.ai{background:#38215f}
@media(max-width:360px){.box{padding:22px 14px}.engine{padding:8px 10px}}
</style></head><body>
<div class="box">
<h1>▣ DexBrowse By Fuad</h1>
<div class="subtitle">A simple, private browser for your phone</div>
<div class="greeting">Hello, <button id="name" class="name" onclick="location.href='dexbrowse://profile'">Guest</button></div>
<div class="engines" id="engines">
<button class="engine" data-engine="Google">Google</button>
<button class="engine" data-engine="Bing">Bing</button>
<button class="engine" data-engine="DuckDuckGo">DuckDuckGo</button>
<button class="engine" data-engine="Brave">Brave</button>
<button class="engine" data-engine="Perplexity">Perplexity</button>
</div>
<form id="f"><input id="q" type="text" placeholder="Search the web or enter a website..." autocomplete="off"><button type="submit">Search</button></form>
<button id="last-site" class="last" type="button" hidden></button>
<div class="quick">
<button class="shortcut ai" onclick="location.href='dexbrowse://ai'">Open AI sidebar</button>
<button class="shortcut ai" onclick="location.href='https://www.perplexity.ai'">Perplexity AI</button>
<button class="shortcut" onclick="location.href='https://chatgpt.com'">ChatGPT</button>
<button class="shortcut" onclick="location.href='https://gemini.google.com'">Google Gemini</button>
<button class="shortcut" onclick="location.href='https://www.youtube.com'">YouTube</button>
<button class="shortcut" onclick="location.href='https://github.com'">GitHub</button>
</div>
</div>
<script>
document.body.className='__THEME__';
document.getElementById('name').textContent=__NAME__;
var selectedEngine=__ENGINE__;
document.querySelectorAll('[data-engine]').forEach(function(button){
  button.classList.toggle('selected',button.dataset.engine===selectedEngine);
  button.onclick=function(){
    selectedEngine=button.dataset.engine;
    document.querySelectorAll('[data-engine]').forEach(function(item){
      item.classList.toggle('selected',item===button);
    });
  };
});
var lastSite=__LAST_SITE__;
if(lastSite){
  var lastButton=document.getElementById('last-site');
  lastButton.hidden=false;
  lastButton.textContent='↩ Continue where you left off · '+lastSite;
  lastButton.onclick=function(){location.href='dexbrowse://open?url='+encodeURIComponent(lastSite);};
}
document.getElementById('f').onsubmit=function(e){
  e.preventDefault();
  var q=document.getElementById('q').value.trim();
  if(q)location.href='dexbrowse://search?e='+encodeURIComponent(selectedEngine)+'&q='+encodeURIComponent(q);
};
</script></body></html>
"""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        security = SecurityManager(this)
        val guestCleanupPending = cleanupAbandonedGuestProfiles()
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE)
        PasswordVault(this).clear()
        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(bg)
        }
        setContentView(root)

        if (security.profiles().isEmpty()) {
            showCreateProfile(firstProfile = true)
        } else {
            showProfileLogin()
        }

        if (guestCleanupPending) {
            handler.postDelayed({
                if (!isFinishing && cleanupAbandonedGuestProfiles()) {
                    toast("Previous guest data is still in use; cleanup will retry next launch.", true)
                }
            }, 2000)
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
            setTextColor(foregroundColor)
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
            setTextColor(foregroundColor)
            setHintTextColor(muted)
            setSingleLine(true)
            if (secret) {
                inputType = InputType.TYPE_CLASS_TEXT or
                    InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
        }

    private fun dialog(): AlertDialog.Builder =
        AlertDialog.Builder(
            this,
            if (isLightTheme) android.R.style.Theme_Material_Light_Dialog_Alert
            else android.R.style.Theme_Material_Dialog_Alert
        )

    private fun toast(message: String, long: Boolean = false) {
        Toast.makeText(
            this,
            message,
            if (long) Toast.LENGTH_LONG else Toast.LENGTH_SHORT
        ).show()
    }

    @Suppress("DEPRECATION")
    private fun updateSystemBars() {
        window.statusBarColor = bg
        window.navigationBarColor = bg
        window.decorView.systemUiVisibility =
            if (isLightTheme) {
                View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or
                    View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            } else {
                0
            }
    }

    // ---------- lock screen ----------

    private fun multiProfileSupported(): Boolean =
        WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)

    private fun cleanupAbandonedGuestProfiles(): Boolean {
        if (!multiProfileSupported()) return false
        var cleanupPending = false
        val registry = getSharedPreferences("dexbrowse_guest_sessions", MODE_PRIVATE)
        val profileIds = registry.getStringSet("profile_ids", emptySet()).orEmpty().toList()
        profileIds.forEach { id ->
            val lastUsedKey = "last_used_$id"
            val lastUsed = registry.getLong(lastUsedKey, 0L)
            if (lastUsed == 0L) {
                registry.edit().putLong(lastUsedKey, System.currentTimeMillis()).apply()
                return@forEach
            }
            if (System.currentTimeMillis() - lastUsed < guestProfileRetentionMillis) {
                return@forEach
            }
            val store = ProfileStore.getInstance()
            val profile = store.getProfile(id)
            if (profile != null) {
                val deleted = try {
                    store.deleteProfile(id)
                } catch (error: IllegalStateException) {
                    if (error.message?.contains("in-use profile", ignoreCase = true) != true) {
                        throw error
                    }
                    android.util.Log.w(
                        "DexBrowse",
                        "Deferring cleanup because a guest WebView profile is still in use"
                    )
                    false
                }
                if (!deleted) {
                    cleanupPending = true
                    return@forEach
                }
            }
            if (!deleteOfflinePages(id)) {
                cleanupPending = true
                return@forEach
            }
            CredentialVault(this, id).deleteProfileData()
            getSharedPreferences("dexbrowse_history_$id", MODE_PRIVATE).edit().clear().apply()
            getSharedPreferences("dexbrowse_guest_settings_$id", MODE_PRIVATE).edit().clear().apply()
            val remaining = registry.getStringSet("profile_ids", emptySet()).orEmpty().toMutableSet()
            remaining.remove(id)
            registry.edit()
                .putStringSet("profile_ids", remaining)
                .remove(lastUsedKey)
                .apply()
        }
        return cleanupPending
    }

    private fun registerGuestProfile(id: String) {
        val registry = getSharedPreferences("dexbrowse_guest_sessions", MODE_PRIVATE)
        val ids = registry.getStringSet("profile_ids", emptySet()).orEmpty().toMutableSet()
        ids.add(id)
        guestUsageRecordedAt = System.currentTimeMillis()
        registry.edit()
            .putStringSet("profile_ids", ids)
            .putLong("last_used_$id", guestUsageRecordedAt)
            .apply()
    }

    private fun deleteOfflinePages(profileId: String): Boolean {
        val safeProfileId = profileId.replace(Regex("[^A-Za-z0-9_-]"), "_")
        val directory = File(filesDir, "offline-pages/$safeProfileId")
        return !directory.exists() || directory.deleteRecursively()
    }

    private fun recordGuestProfileUse(id: String) {
        val now = System.currentTimeMillis()
        if (now - guestUsageRecordedAt < 60_000L) return
        val registry = getSharedPreferences("dexbrowse_guest_sessions", MODE_PRIVATE)
        registry.edit().putLong("last_used_$id", now).apply()
        guestUsageRecordedAt = now
    }

    private fun startGuestBrowser() {
        if (!multiProfileSupported()) {
            loginMessage = "Update Android System WebView to use a private guest browser"
            showProfileLogin()
            return
        }
        val id = reusableGuestProfileId
        try {
            destroyBrowserSession()
            ProfileStore.getInstance().getOrCreateProfile(id)
            registerGuestProfile(id)
            guestProfileId = id
            guestMode = true
            setupProfileData()
            loginMessage = null
            wrongPasscodeAttempts = 0
            lastInteractionAt = SystemClock.elapsedRealtime()
            showBrowser()
            toast("Guest browser opened. Its data is kept for 7 days after last use.")
        } catch (error: Exception) {
            guestProfileId = null
            guestMode = false
            loginMessage = "Could not start guest browser: ${error.localizedMessage ?: "WebView profile error"}"
            showProfileLogin()
        }
    }

    private fun finishGuestSession(showLogin: Boolean, closeApp: Boolean = false) {
        val id = guestProfileId
        if (id == null) {
            guestMode = false
            if (closeApp) finishAndRemoveTask()
            else if (showLogin) showProfileLogin()
            return
        }
        if (browserVisible) persistSession()
        browserVisible = false
        lockRunnable?.let(handler::removeCallbacks)
        lockRunnable = null
        destroyBrowserSession()
        try {
            val registry = getSharedPreferences("dexbrowse_guest_sessions", MODE_PRIVATE)
            val ids = registry.getStringSet("profile_ids", emptySet()).orEmpty().toMutableSet()
            ids.add(id)
            registry.edit()
                .putStringSet("profile_ids", ids)
                .putLong("last_used_$id", System.currentTimeMillis())
                .apply()
            guestUsageRecordedAt = System.currentTimeMillis()
            guestMode = false
            guestProfileId = null
            wrongPasscodeAttempts = 0
            if (showLogin && !closeApp) showProfileLogin()
        } catch (error: Exception) {
            guestMode = false
            guestProfileId = null
            loginMessage = "Guest session details could not be saved."
            if (showLogin && !closeApp) showProfileLogin()
            toast("Could not save guest session: ${error.localizedMessage ?: "storage error"}", true)
        } finally {
            if (closeApp) finishAndRemoveTask()
        }
    }

    private fun setupProfileData() {
        val profileId = if (guestMode) guestProfileId ?: error("Guest profile is missing")
            else security.activeProfileId()
        history = HistoryManager(this, profileId)
        credentialVault = CredentialVault(this, profileId)
        blocker.enabled = prefs.getBoolean("adblock", true)
    }

    private fun showProfileLogin() {
        if (guestMode) {
            finishGuestSession(showLogin = true)
            return
        }
        if (browserVisible) persistSession()
        browserVisible = false
        lockRunnable?.let(handler::removeCallbacks)
        lockRunnable = null
        root.removeAllViews()
        root.setBackgroundColor(bg)
        updateSystemBars()
        root.gravity = Gravity.CENTER

        if (security.profiles().isEmpty()) {
            showCreateProfile(firstProfile = true)
            return
        }
        val card = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(22), dp(20), dp(18))
            background = shape(panel, border, 20)
        }

        card.addView(TextView(this).apply {
            text = "DexBrowse"
            textSize = 22f
            setTypeface(null, Typeface.BOLD)
            setTextColor(sky)
            gravity = Gravity.CENTER
        })

        card.addView(
            TextView(this).apply {
                text = "Enter a profile passcode to continue"
                textSize = 14f
                gravity = Gravity.CENTER
                setTextColor(foregroundColor)
            },
            lp(matchP, wrapC, 0f, 0, 8, 0, 10)
        )

        loginMessage?.let { message ->
            card.addView(TextView(this).apply {
                text = message
                textSize = 12f
                gravity = Gravity.CENTER
                setTextColor(if (message.startsWith("Incorrect")) Color.RED else muted)
                setPadding(0, 0, 0, dp(10))
            })
        }

        val passcode = field("Passcode", true)
        card.addView(passcode, lp(matchP, wrapC, 0f, 0, 0, 0, 12))
        card.addView(chip("Open browser", blue, blue) {
            unlockMatchingProfile(passcode.text.toString())
        })
        root.addView(card, lp(matchP, wrapC, 0f, 24, 0, 24, 0))
        passcode.setOnEditorActionListener { _, _, _ ->
            unlockMatchingProfile(passcode.text.toString())
            true
        }
    }

    private fun unlockMatchingProfile(passcode: String) {
        if (passcode.isBlank()) {
            loginMessage = "Enter a passcode"
            showProfileLogin()
            return
        }
        val matchingProfiles = security.profiles().filter {
            security.verifyPassword(passcode, it.id)
        }
        if (matchingProfiles.isEmpty()) {
            wrongPasscodeAttempts++
            if (wrongPasscodeAttempts >= 2) {
                if (multiProfileSupported()) {
                    startGuestBrowser()
                    return
                }
                loginMessage = "Incorrect passcode twice. Update Android System WebView for a private guest browser."
            } else {
                loginMessage = "Incorrect passcode"
            }
            showProfileLogin()
            return
        }
        val profile = matchingProfiles.firstOrNull { it.id == security.activeProfileId() }
            ?: matchingProfiles.first()
        if (profile.id != SecurityManager.DEFAULT_PROFILE_ID && !multiProfileSupported()) {
            loginMessage = "Update Android System WebView to use this profile"
            showProfileLogin()
            return
        }
        try {
            if (profile.id != SecurityManager.DEFAULT_PROFILE_ID) {
                ProfileStore.getInstance().getOrCreateProfile(profile.id)
            }
            if (profile.id != security.activeProfileId()) {
                destroyBrowserSession()
            }
            security.setActiveProfile(profile.id)
            setupProfileData()
            loginMessage = null
            wrongPasscodeAttempts = 0
            lastInteractionAt = SystemClock.elapsedRealtime()
            showBrowser()
        } catch (error: Exception) {
            loginMessage = "Could not open profile: ${error.localizedMessage ?: "WebView profile error"}"
            showProfileLogin()
        }
    }

    private fun showCreateProfile(firstProfile: Boolean = false) {
        if (security.profiles().isNotEmpty() && !multiProfileSupported()) {
            toast("Update Android System WebView before adding isolated profiles", true)
            return
        }
        val name = field("Profile name")
        val passcode = field("Passcode (no minimum length)", true)
        val recovery = field("Recovery phrase (optional)", true)
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
            addView(name)
            addView(passcode)
            addView(recovery)
        }
        dialog()
            .setTitle(if (firstProfile) "Create your browser profile" else "Add profile")
            .setMessage("Each profile has its own passcode, cookies, history, and saved logins.")
            .setView(box)
            .setPositiveButton("Create", null)
            .setNegativeButton("Cancel", null)
            .show()
            .also { prompt ->
                prompt.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                    try {
                        val id = security.createProfile(
                            name.text.toString(),
                            passcode.text.toString(),
                            recovery.text.toString()
                        )
                        if (firstProfile) security.setActiveProfile(id)
                        prompt.dismiss()
                        showProfileLogin()
                    } catch (error: IllegalArgumentException) {
                        toast(error.message ?: "Enter a profile name and a non-empty passcode", true)
                    }
                }
            }
    }

    private fun lockNow() {
        lockRunnable?.let(handler::removeCallbacks)
        lockRunnable = null
        showProfileLogin()
        toast("Locked")
    }

    private fun destroyBrowserSession() {
        tabs.forEach { tab ->
            (tab.web.parent as? ViewGroup)?.removeView(tab.web)
            tab.web.destroy()
        }
        tabs.clear()
        activeTab = -1
        aiWeb?.let { web ->
            (web.parent as? ViewGroup)?.removeView(web)
            web.destroy()
        }
        aiWeb = null
    }

    // ---------- browser screen ----------

    private fun showBrowser() {
        browserVisible = true
        root.removeAllViews()
        root.setBackgroundColor(bg)
        updateSystemBars()
        root.gravity = Gravity.TOP

        val nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(navBg)
            setPadding(dp(8), dp(6), dp(8), dp(6))
        }
        fun icon(
            label: String,
            description: String = label,
            action: () -> Unit
        ) = TextView(this).apply {
            text = label
            textSize = 21f
            setTextColor(foregroundColor)
            gravity = Gravity.CENTER
            minimumWidth = dp(42)
            minimumHeight = dp(48)
            setPadding(dp(4), dp(6), dp(4), dp(6))
            contentDescription = description
            isFocusable = true
            background = android.graphics.drawable.RippleDrawable(
                ColorStateList.valueOf(blue),
                shape(panel, border, 14),
                null
            )
            setOnClickListener { action() }
        }

        addressAdapter = ArrayAdapter(
            this,
            android.R.layout.simple_dropdown_item_1line,
            history.getAll()
        )
        address = AutoCompleteTextView(this).apply {
            setTextColor(foregroundColor)
            setHintTextColor(muted)
            setSingleLine(true)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_URI
            textSize = 15f
            imeOptions = EditorInfo.IME_ACTION_GO
            hint = "Search or enter website"
            setPadding(dp(14), dp(7), dp(14), dp(7))
            background = android.graphics.drawable.ColorDrawable(Color.TRANSPARENT)
            threshold = 1
            setAdapter(addressAdapter)
            setOnEditorActionListener { _, _, _ ->
                navigate(text.toString())
                true
            }
            setOnItemClickListener { _, _, position, _ ->
                navigate(addressAdapter.getItem(position).orEmpty())
            }
        }
        val addressBox = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = shape(panel, border, 24)
            setPadding(dp(8), 0, dp(6), 0)
        }
        addressBox.addView(TextView(this).apply {
            text = "ⓘ"
            textSize = 18f
            gravity = Gravity.CENTER
            setTextColor(muted)
            contentDescription = "Site information"
            setPadding(dp(4), dp(8), dp(8), dp(8))
            setOnClickListener { showSiteInfo() }
        })
        addressBox.addView(address, LinearLayout.LayoutParams(0, wrapC, 1f))
        nav.addView(addressBox, lp(matchP, wrapC, 1f))
        root.addView(nav)

        content = FrameLayout(this)
        root.addView(content, lp(matchP, 0, 1f))

        val bottomBar = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setBackgroundColor(navBg)
            setPadding(dp(4), dp(3), dp(4), dp(3))
        }
        bottomBar.addView(icon("⌂", "Home") { loadHome() }, lp(0, wrapC, 1f, 4))
        bottomBar.addView(icon("☆", "Bookmarks") { showBookmarks() }, lp(0, wrapC, 1f, 4))
        bottomBar.addView(icon("⌕", "Search") { focusAddressForSearch() }, lp(0, wrapC, 1f, 4))
        tabsButton = FrameLayout(this).apply {
            minimumHeight = dp(48)
            contentDescription = "Show ${tabs.size} tabs"
            isFocusable = true
            background = android.graphics.drawable.RippleDrawable(
                ColorStateList.valueOf(blue),
                shape(panel, border, 14),
                null
            )
            setOnClickListener { showTabs() }
        }
        tabsButton.addView(TextView(this).apply {
            text = "▢"
            textSize = 27f
            gravity = Gravity.CENTER
            setTextColor(foregroundColor)
        }, FrameLayout.LayoutParams(matchP, matchP, Gravity.CENTER))
        tabCountButton = TextView(this).apply {
            text = "${tabs.size}"
            textSize = 10f
            setTypeface(null, Typeface.BOLD)
            gravity = Gravity.CENTER
            setTextColor(foregroundColor)
            isClickable = false
            isFocusable = false
        }
        tabsButton.addView(
            tabCountButton,
            FrameLayout.LayoutParams(matchP, matchP, Gravity.CENTER)
        )
        bottomBar.addView(tabsButton, lp(0, wrapC, 1f, 4))
        bottomBar.addView(icon("⋮", "More options") { showSettings() }, lp(0, wrapC, 1f, 4))
        root.addView(bottomBar)

        aiPanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            visibility = View.GONE
            layoutParams = lp(matchP, 0, 1f)
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
            setTextColor(foregroundColor)
            setPadding(dp(6), dp(6), dp(6), dp(6))
            setOnClickListener { chooseAi() }
        }
        aiBar.addView(aiTitle, lp(0, wrapC, 1f))
        aiBar.addView(TextView(this).apply {
            text = "✕"
            textSize = 18f
            setTextColor(foregroundColor)
            setPadding(dp(12), dp(4), dp(12), dp(4))
            setOnClickListener { aiPanel.visibility = View.GONE }
        })
        aiPanel.addView(aiBar, lp(matchP, wrapC))
        val sidebar = aiWeb ?: createAiWeb().also { aiWeb = it }
        (sidebar.parent as? ViewGroup)?.removeView(sidebar)
        aiPanel.addView(sidebar, lp(matchP, 0, 1f))
        root.addView(aiPanel, lp(matchP, 0, 1f))

        if (tabs.isEmpty()) {
            restoreSession()
        }
        if (tabs.isEmpty()) {
            activeTab = -1
            addTab()
        } else {
            renderTabs()
            showActiveTab()
        }
        scheduleAutoLock()
    }

    private fun createAiWeb(): WebView {
        val web = WebView(this)
        applyProfile(web)
        applyChromiumCapabilities(web)
        web.webChromeClient = CapabilityChromeClient()
        web.webViewClient = WebViewClient()
        return web
    }

    // ---------- Chromium capabilities ----------

    // Everything the Chromium engine can do that a bare WebView leaves switched
    // off: media autoplay, geolocation, safe browsing, Chrome-like request
    // headers and file downloads.
    private fun applyChromiumCapabilities(web: WebView) {
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setGeolocationEnabled(true)
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.REQUESTED_WITH_HEADER_ALLOW_LIST)) {
            // Stop sending X-Requested-With: com.fuad.dexbrowse like a plain WebView does.
            WebSettingsCompat.setRequestedWithHeaderOriginAllowList(web.settings, emptySet())
        }
        if (WebViewFeature.isFeatureSupported(WebViewFeature.SAFE_BROWSING_ENABLE)) {
            WebSettingsCompat.setSafeBrowsingEnabled(web.settings, true)
        }
        web.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            startDownload(web, url, userAgent, contentDisposition, mimeType)
        }
    }

    private fun startDownload(
        web: WebView,
        url: String?,
        userAgent: String?,
        contentDisposition: String?,
        mimeType: String?
    ) {
        if (url.isNullOrBlank()) return
        if (guestMode) {
            toast("Downloads are disabled in the guest browser", true)
            return
        }
        val scheme = Uri.parse(url).scheme?.lowercase()
        if (scheme != "http" && scheme != "https") {
            toast("This kind of download is not supported", true)
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q &&
            checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            pendingDownload = arrayOf(url, userAgent, contentDisposition, mimeType)
            requestPermissions(arrayOf(Manifest.permission.WRITE_EXTERNAL_STORAGE), reqStorage)
            return
        }
        try {
            val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
            val request = DownloadManager.Request(Uri.parse(url)).apply {
                if (!mimeType.isNullOrBlank()) setMimeType(mimeType)
                cookieManager(web).getCookie(url)?.let { addRequestHeader("Cookie", it) }
                if (!userAgent.isNullOrBlank()) addRequestHeader("User-Agent", userAgent)
                setTitle(fileName)
                setNotificationVisibility(
                    DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED
                )
                setDestinationInExternalPublicDirectory(Environment.DIRECTORY_DOWNLOADS, fileName)
            }
            (getSystemService(DOWNLOAD_SERVICE) as DownloadManager).enqueue(request)
            toast("Downloading $fileName")
        } catch (error: Exception) {
            toast("Download failed: ${error.localizedMessage ?: "unknown error"}", true)
        }
    }

    private fun enterFullscreen(view: View, callback: WebChromeClient.CustomViewCallback) {
        if (customView != null) {
            callback.onCustomViewHidden()
            return
        }
        customView = view
        customViewCallback = callback
        (window.decorView as FrameLayout).addView(
            view,
            FrameLayout.LayoutParams(matchP, matchP)
        )
        hideSystemBarsForFullscreen()
    }

    private fun exitFullscreen() {
        val view = customView ?: return
        (view.parent as? ViewGroup)?.removeView(view)
        customView = null
        customViewCallback?.onCustomViewHidden()
        customViewCallback = null
        updateSystemBars()
    }

    @Suppress("DEPRECATION")
    private fun hideSystemBarsForFullscreen() {
        window.decorView.systemUiVisibility =
            View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
    }

    private fun hasPermission(permission: String): Boolean =
        checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    // Chromium web permission prompts: camera, microphone (WebRTC / getUserMedia),
    // DRM-protected media (EME) and MIDI. Android runtime permissions are
    // requested only after the user allows the site.
    private fun handleWebPermission(request: PermissionRequest) {
        val wanted = request.resources.toList()
        val labels = mutableListOf<String>()
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE in wanted) labels += "camera"
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in wanted) labels += "microphone"
        if (PermissionRequest.RESOURCE_PROTECTED_MEDIA_ID in wanted) labels += "protected media"
        if (PermissionRequest.RESOURCE_MIDI_SYSEX in wanted) labels += "MIDI devices"
        if (labels.isEmpty()) {
            request.deny()
            return
        }
        val host = request.origin?.host ?: "This site"
        dialog()
            .setTitle("Allow access?")
            .setMessage("$host wants to use your ${labels.joinToString(" and ")}.")
            .setPositiveButton("Allow") { _, _ ->
                val missing = mutableListOf<String>()
                if (PermissionRequest.RESOURCE_VIDEO_CAPTURE in wanted &&
                    !hasPermission(Manifest.permission.CAMERA)
                ) missing += Manifest.permission.CAMERA
                if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in wanted &&
                    !hasPermission(Manifest.permission.RECORD_AUDIO)
                ) missing += Manifest.permission.RECORD_AUDIO
                if (missing.isEmpty()) {
                    request.grant(request.resources)
                } else {
                    pendingWebPermission?.deny()
                    pendingWebPermission = request
                    requestPermissions(missing.toTypedArray(), reqWebPermissions)
                }
            }
            .setNegativeButton("Block") { _, _ -> request.deny() }
            .setOnCancelListener { request.deny() }
            .show()
    }

    private fun handleGeolocation(origin: String, callback: GeolocationPermissions.Callback) {
        val host = Uri.parse(origin).host ?: origin
        dialog()
            .setTitle("Share your location?")
            .setMessage("$host wants to know your location.")
            .setPositiveButton("Allow") { _, _ ->
                if (hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) ||
                    hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
                ) {
                    callback.invoke(origin, true, false)
                } else {
                    pendingGeoCallback?.invoke(pendingGeoOrigin, false, false)
                    pendingGeoOrigin = origin
                    pendingGeoCallback = callback
                    requestPermissions(
                        arrayOf(
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION
                        ),
                        reqGeolocation
                    )
                }
            }
            .setNegativeButton("Block") { _, _ -> callback.invoke(origin, false, false) }
            .setOnCancelListener { callback.invoke(origin, false, false) }
            .show()
    }

    // Shared Chromium client used by every tab and by the AI sidebar.
    private open inner class CapabilityChromeClient : WebChromeClient() {

        override fun onPermissionRequest(request: PermissionRequest?) {
            val req = request ?: return
            runOnUiThread { handleWebPermission(req) }
        }

        override fun onPermissionRequestCanceled(request: PermissionRequest?) {
            if (pendingWebPermission === request) pendingWebPermission = null
        }

        override fun onGeolocationPermissionsShowPrompt(
            origin: String?,
            callback: GeolocationPermissions.Callback?
        ) {
            if (origin == null || callback == null) return
            runOnUiThread { handleGeolocation(origin, callback) }
        }

        override fun onShowFileChooser(
            webView: WebView?,
            filePathCallback: ValueCallback<Array<Uri>>?,
            fileChooserParams: WebChromeClient.FileChooserParams?
        ): Boolean {
            val callback = filePathCallback ?: return false
            fileChooserCallback?.onReceiveValue(null)
            fileChooserCallback = callback
            val intent = try {
                fileChooserParams?.createIntent()
            } catch (_: Exception) {
                null
            }
            if (intent == null) {
                fileChooserCallback = null
                callback.onReceiveValue(null)
                return false
            }
            externalFlowInProgress = true
            return try {
                @Suppress("DEPRECATION")
                startActivityForResult(intent, reqFileChooser)
                true
            } catch (_: Exception) {
                externalFlowInProgress = false
                fileChooserCallback = null
                callback.onReceiveValue(null)
                toast("No app available to choose files", true)
                true
            }
        }

        override fun onShowCustomView(
            view: View?,
            callback: WebChromeClient.CustomViewCallback?
        ) {
            if (view == null || callback == null) return
            enterFullscreen(view, callback)
        }

        override fun onHideCustomView() {
            exitFullscreen()
        }
    }

    private fun applyProfile(web: WebView) {
        val profileId = if (guestMode) guestProfileId ?: error("Guest profile is missing")
            else security.activeProfileId()
        if (profileId != SecurityManager.DEFAULT_PROFILE_ID) {
            check(multiProfileSupported()) {
                "This Android System WebView does not support isolated profiles"
            }
            WebViewCompat.setProfile(web, profileId)
        }
    }

    private fun cookieManager(web: WebView): CookieManager =
        if (!guestMode && security.activeProfileId() == SecurityManager.DEFAULT_PROFILE_ID) {
            CookieManager.getInstance()
        } else {
            WebViewCompat.getProfile(web).cookieManager
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

    private fun hasNetworkConnection(): Boolean {
        val connectivity = getSystemService(ConnectivityManager::class.java) ?: return false
        val network = connectivity.activeNetwork ?: return false
        return connectivity.getNetworkCapabilities(network)
            ?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
    }

    private fun offlineDirectory(): File {
        val profileId = if (guestMode) {
            guestProfileId ?: error("Guest profile is missing")
        } else {
            security.activeProfileId()
        }
        val safeProfileId = profileId.replace(Regex("[^A-Za-z0-9_-]"), "_")
        return File(filesDir, "offline-pages/$safeProfileId")
    }

    private fun offlineArchiveFor(url: String): File? {
        if (!url.startsWith("https://") && !url.startsWith("http://")) return null
        val digest = MessageDigest.getInstance("SHA-256")
            .digest(url.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
        return File(offlineDirectory(), "$digest.mht")
    }

    private fun saveOfflineArchive(web: WebView, url: String) {
        val archive = offlineArchiveFor(url) ?: return
        try {
            val directory = archive.parentFile
                ?: throw IllegalStateException("Offline page storage path is invalid")
            if (!directory.exists() && !directory.mkdirs()) {
                throw IllegalStateException("Could not create offline page storage")
            }
            val temporary = File(directory, "${archive.name}.${System.nanoTime()}.mht")
            web.saveWebArchive(temporary.absolutePath, false) { savedPath ->
                val savedFile = savedPath?.let { File(it) } ?: temporary
                if (!savedFile.isFile) {
                    android.util.Log.w("DexBrowse", "WebView did not save an offline page")
                    temporary.delete()
                    return@saveWebArchive
                }
                try {
                    if (savedFile != archive && !savedFile.renameTo(archive)) {
                        savedFile.copyTo(archive, overwrite = true)
                        if (!savedFile.delete()) {
                            android.util.Log.w("DexBrowse", "Could not remove temporary offline archive")
                        }
                    }
                } catch (error: java.io.IOException) {
                    android.util.Log.e("DexBrowse", "Could not store offline page", error)
                    savedFile.delete()
                }
            }
        } catch (error: Exception) {
            android.util.Log.e("DexBrowse", "Could not save offline page", error)
        }
    }

    private fun openOfflineArchive(tab: Tab, url: String): Boolean {
        val archive = offlineArchiveFor(url) ?: return false
        if (!archive.isFile) return false
        tab.lastOnlineUrl = url
        tab.isOfflinePage = true
        tab.offlineFallbackAttempted = true
        tab.web.loadUrl(Uri.fromFile(archive).toString())
        toast("Offline copy opened")
        return true
    }

    private fun reloadCurrentPage() {
        val tab = current() ?: return
        tab.autofillPromptedOrigin = null
        val url = tab.lastOnlineUrl
        if (tab.isOfflinePage && hasNetworkConnection() && url != null) {
            tab.offlineFallbackAttempted = false
            tab.isOfflinePage = false
            tab.web.loadUrl(url)
        } else {
            tab.web.reload()
        }
    }

    private fun applyView(web: WebView) {
        val selectedAgent = prefs.getString("user_agent", null)
            ?: if (prefs.getBoolean("pcua", true)) "Windows 10/11 · Chrome"
            else "Android · Default"
        val wide = prefs.getBoolean("wide", true)
        web.settings.userAgentString = userAgents[selectedAgent]
            ?.takeIf { it.isNotEmpty() }
            ?: if (selectedAgent == "Android · Default") mobileUA else desktopUA
        web.settings.useWideViewPort = wide
        web.settings.loadWithOverviewMode = wide
        web.settings.setSupportZoom(true)
        web.settings.builtInZoomControls = false
        web.settings.displayZoomControls = false
        web.setInitialScale(prefs.getInt("page_zoom", 100).coerceIn(50, 200))
    }

    private fun refreshViews() {
        tabs.forEach { applyView(it.web) }
        current()?.let { if (it.start) loadStart(it.web) else it.web.reload() }
    }

    private fun setUserAgent(profile: String) {
        prefs.edit()
            .putString("user_agent", profile)
            .putBoolean("pcua", profile != "Android · Default")
            .apply()
        refreshViews()
    }

    private fun setDesktopLayout(enabled: Boolean) {
        prefs.edit().putBoolean("wide", enabled).apply()
        refreshViews()
    }

    // ---------- tabs ----------

    private fun homepage(): String =
        prefs.getString("homepage", "start") ?: "start"

    private fun current(): Tab? = tabs.getOrNull(activeTab)

    private fun loadStart(web: WebView) {
        val safeName = JSONObject.quote(displayName())
            .replace("<", "\\u003c")
            .replace(">", "\\u003e")
            .replace("&", "\\u0026")
        val lastVisited = history.getAll().firstOrNull()
            ?.let { JSONObject.quote(it) }
            ?.replace("<", "\\u003c")
            ?.replace(">", "\\u003e")
            ?.replace("&", "\\u0026")
            ?: "null"
        web.loadDataWithBaseURL(
            "$startBase/",
            startPage
                .replace("__ENGINE__", JSONObject.quote(engine()))
                .replace("__NAME__", safeName)
                .replace("__LAST_SITE__", lastVisited)
                .replace("__THEME__", if (isLightTheme) "light" else "dark"),
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
            "profile" -> changeDisplayName()
            "open" -> uri.getQueryParameter("url")?.let(::navigate)
            "search" -> {
                val query = uri.getQueryParameter("q") ?: return
                val chosen = uri.getQueryParameter("e")
                if (chosen != null && searchEngines.containsKey(chosen)) {
                    prefs.edit().putString("engine", chosen).apply()
                }
                navigate(query)
            }
        }
    }

    private fun originOf(value: String?): String? {
        val uri = value?.let(Uri::parse) ?: return null
        val host = uri.host?.lowercase() ?: return null
        if (uri.scheme != "https") return null
        val port = if (uri.port == -1 || uri.port == 443) "" else ":${uri.port}"
        return "https://$host$port"
    }

    private inner class CredentialBridge(private val web: WebView) {
        @JavascriptInterface
        fun offer(origin: String, username: String, password: String) {
            if (!saveLoginsEnabled()) return
            if (username.isBlank() || username.length > 512 || password.isBlank() || password.length > 2048) {
                return
            }
            val submittedOrigin = originOf(origin) ?: return
            handler.post {
                if (originOf(web.url) != submittedOrigin || !saveLoginsEnabled()) {
                    return@post
                }
                try {
                    if (credentialVault.saveIfChanged(submittedOrigin, username, password)) {
                        toast("Login saved securely for $submittedOrigin")
                    }
                } catch (error: Exception) {
                    toast("Could not save login: ${error.localizedMessage ?: "storage error"}", true)
                }
            }
        }
    }

    private fun saveLoginsEnabled(): Boolean =
        !guestMode && prefs.getBoolean("save_logins", true)

    private fun autoLoginEnabled(): Boolean =
        prefs.getBoolean("autofill_logins", true)

    private fun installLoginObserver(web: WebView) {
        if (!saveLoginsEnabled() || originOf(web.url) == null) return
        web.evaluateJavascript(
            """
            (function(){
              if(window.__dexBrowseSaveHook)return;
              window.__dexBrowseSaveHook=true;
              document.addEventListener('submit',function(event){
                var form=event.target;
                if(!form||!form.querySelector)return;
                var password=form.querySelector('input[type="password"]');
                var username=form.querySelector('input[autocomplete="username"],input[type="email"],input[type="text"],input[type="tel"]');
                if(password&&username&&username.value&&password.value){
                  window.DexBrowseCredentials.offer(location.origin,username.value,password.value);
                }
              },true);
            })();
            """.trimIndent(),
            null
        )
    }

    private fun offerSavedLogin(web: WebView, origin: String) {
        if (!autoLoginEnabled()) return
        val tab = tabs.firstOrNull { it.web === web } ?: return
        if (tab.autofillPromptedOrigin == origin) return
        try {
            if (credentialVault.get(origin) == null) return
        } catch (error: Exception) {
            toast("Could not read saved login: ${error.localizedMessage ?: "storage error"}", true)
            return
        }

        tab.autofillPromptedOrigin = origin
        web.evaluateJavascript(
            """
            (function(){
              var passwords=document.querySelectorAll('input[type="password"]');
              var user=document.querySelector('input[autocomplete="username"],input[type="email"],input[type="text"],input[type="tel"]');
              return passwords.length===1&&!!user&&passwords[0].autocomplete!=='new-password';
            })();
            """.trimIndent(),
            { hasPasswordField ->
                if (hasPasswordField != "true" || originOf(web.url) != origin) return@evaluateJavascript
                fillSavedLogin(origin, web, autoSubmit = true)
            }
        )
    }

    private fun refreshAddressSuggestions() {
        if (!::addressAdapter.isInitialized) return
        addressAdapter.clear()
        addressAdapter.addAll(history.getAll())
        addressAdapter.notifyDataSetChanged()
    }

    private fun fillSavedLogin(
        origin: String? = originOf(current()?.web?.url),
        targetWeb: WebView? = current()?.web,
        autoSubmit: Boolean = false
    ) {
        val web = targetWeb ?: return
        val currentOrigin = originOf(web.url)
        if (currentOrigin == null || currentOrigin != origin) {
            toast("Open the saved website before filling its login")
            return
        }
        val credential = try {
            credentialVault.get(currentOrigin)
        } catch (error: Exception) {
            toast("Could not read saved login: ${error.localizedMessage ?: "storage error"}", true)
            return
        }
        if (credential == null) {
            toast("No saved login for this website")
            return
        }
        val username = JSONObject.quote(credential.username)
        val password = JSONObject.quote(credential.password)
        web.evaluateJavascript(
            """
            (function(){
              var user=document.querySelector('input[autocomplete="username"],input[type="email"],input[type="text"],input[type="tel"]');
              var passwords=document.querySelectorAll('input[type="password"]');
              var pass=passwords.length===1?passwords[0]:null;
              if(!user||!pass||pass.autocomplete==='new-password')return false;
              var form=pass.form;
              if($autoSubmit&&(!form||user.form!==form))return false;
              function setValue(element,value){
                var setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
                setter.call(element,value);
                element.dispatchEvent(new Event('input',{bubbles:true}));
                element.dispatchEvent(new Event('change',{bubbles:true}));
              }
              setValue(user,$username);
              setValue(pass,$password);
              if($autoSubmit){
                if(typeof form.requestSubmit==='function')form.requestSubmit();
                else form.submit();
                return 'submitted';
              }
              return true;
            })();
            """.trimIndent()
        ) { result ->
            if (result == "false") {
                toast("Could not find login fields on this page")
            } else if (autoSubmit && result == "\"submitted\"") {
                toast("Signing in with saved login")
            } else if (!autoSubmit) {
                toast("Saved login filled")
            }
        }
    }

    private fun setAutofillLogins(enabled: Boolean) {
        prefs.edit().putBoolean("autofill_logins", enabled).apply()
        if (enabled) {
            current()?.web?.let { web ->
                originOf(web.url)?.let { offerSavedLogin(web, it) }
            }
        }
        toast(if (enabled) "Automatic sign-in with saved logins enabled" else "Automatic sign-in with saved logins disabled")
    }

    private fun addTab(
        url: String? = null,
        restoreScrollY: Int = 0,
        blankTab: Boolean = false
    ) {
        val web = WebView(this)
        applyProfile(web)

        val cookies = cookieManager(web)
        cookies.setAcceptCookie(true)
        cookies.setAcceptThirdPartyCookies(web, false)

        applyChromiumCapabilities(web)
        web.settings.apply {
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(true)
        }
        applyView(web)
        if (saveLoginsEnabled()) {
            web.addJavascriptInterface(CredentialBridge(web), "DexBrowseCredentials")
        }

        web.webChromeClient = object : CapabilityChromeClient() {
            override fun onCreateWindow(
                view: WebView?,
                isDialog: Boolean,
                isUserGesture: Boolean,
                resultMsg: android.os.Message?
            ): Boolean {
                if (!isUserGesture || tabs.size >= 50) return false
                val message = resultMsg ?: return false
                val transport = message.obj as? WebView.WebViewTransport ?: return false
                addTab(blankTab = true)
                val popup = current()?.web ?: return false
                transport.webView = popup
                message.sendToTarget()
                return true
            }

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
                if (request.isForMainFrame && request.hasGesture()) {
                    tabs.firstOrNull { it.web === view }?.autofillPromptedOrigin = null
                }
                return when (uri.scheme) {
                    "dexbrowse" -> {
                        handleInternal(uri)
                        true
                    }
                    "http", "https" -> false
                    else -> true
                }
            }

            override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                super.onPageStarted(view, url, favicon)
                val tab = tabs.firstOrNull { it.web === view }
                if (tab != null && (url?.startsWith("https://") == true || url?.startsWith("http://") == true)) {
                    tab.lastOnlineUrl = url
                    tab.isOfflinePage = false
                    tab.offlineFallbackAttempted = false
                }
                persistSession()
            }

            override fun onReceivedError(
                view: WebView?,
                request: WebResourceRequest?,
                error: WebResourceError?
            ) {
                super.onReceivedError(view, request, error)
                if (request?.isForMainFrame != true || view == null) return
                val tab = tabs.firstOrNull { it.web === view } ?: return
                if (tab.offlineFallbackAttempted || tab.isOfflinePage) return
                val failedUrl = request.url.toString()
                openOfflineArchive(tab, failedUrl)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                val tab = tabs.firstOrNull { it.web === view } ?: return
                val page = url ?: return
                tab.start = page.startsWith(startBase)
                if (tab.start) {
                    tab.title = "DexBrowse Start"
                    tab.isOfflinePage = false
                } else if (page.startsWith("https://") || page.startsWith("http://")) {
                    tab.lastOnlineUrl = page
                    tab.isOfflinePage = false
                    saveOfflineArchive(tab.web, page)
                    history.add(page)
                } else {
                    tab.isOfflinePage = page.startsWith("file://")
                }
                refreshAddressSuggestions()
                renderTabs()
                installLoginObserver(tab.web)
                if (tab === current()) {
                    address.setText(if (tab.start) "" else tab.lastOnlineUrl ?: page)
                    val origin = originOf(page)
                    if (tab.autofillPromptedOrigin != origin) {
                        tab.autofillPromptedOrigin = null
                    }
                    if (origin != null) offerSavedLogin(tab.web, origin)
                }
                if (tab.restoreScrollY > 0) {
                    val scrollY = tab.restoreScrollY
                    tab.restoreScrollY = 0
                    tab.web.postDelayed({ tab.web.scrollTo(0, scrollY) }, 300)
                }
                persistSession()
            }
        }

        val tab = Tab(
            web = web,
            start = !blankTab,
            zoom = prefs.getInt("page_zoom", 100).coerceIn(50, 200),
            lastOnlineUrl = url,
            restoreScrollY = restoreScrollY
        )
        val scaleDetector = ScaleGestureDetector(
            this,
            object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                override fun onScale(detector: ScaleGestureDetector): Boolean {
                    val currentZoom = tab.zoom.coerceIn(50, 200)
                    val targetZoom = (currentZoom * detector.scaleFactor)
                        .toInt()
                        .coerceIn(50, 200)
                    if (targetZoom == currentZoom) return true
                    web.zoomBy(targetZoom.toFloat() / currentZoom.toFloat())
                    tab.zoom = targetZoom
                    prefs.edit().putInt("page_zoom", targetZoom).apply()
                    return true
                }
            }
        )
        web.setOnTouchListener { _, event ->
            scaleDetector.onTouchEvent(event)
            false
        }
        tabs.add(tab)
        activeTab = tabs.lastIndex
        renderTabs()
        showActiveTab()

        if (blankTab) {
            return
        } else if (url == null) {
            loadHome()
        } else {
            tab.start = false
            val archive = offlineArchiveFor(url)
            if (!hasNetworkConnection() && archive?.isFile == true) {
                openOfflineArchive(tab, url)
            } else {
                web.loadUrl(url)
            }
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
            persistSession()
            return
        }
        if (index < activeTab) activeTab--
        activeTab = activeTab.coerceIn(0, tabs.lastIndex)
        showActiveTab()
        renderTabs()
        persistSession()
    }

    private fun showActiveTab() {
        val tab = current() ?: return
        content.removeAllViews()
        (tab.web.parent as? ViewGroup)?.removeView(tab.web)
        content.addView(
            tab.web,
            FrameLayout.LayoutParams(matchP, matchP)
        )
        address.setText(if (tab.start) "" else tab.lastOnlineUrl ?: tab.web.url ?: "")
    }

    private fun renderTabs() {
        if (::tabCountButton.isInitialized) {
            tabCountButton.text = "${tabs.size}"
            tabsButton.contentDescription = "Show ${tabs.size} tabs"
        }
    }

    private fun focusAddressForSearch() {
        if (!::address.isInitialized) return
        address.requestFocus()
        address.setSelection(address.text.length)
        (getSystemService(INPUT_METHOD_SERVICE) as? InputMethodManager)
            ?.showSoftInput(address, InputMethodManager.SHOW_IMPLICIT)
    }

    private fun showSiteInfo() {
        val url = current()?.let { it.lastOnlineUrl ?: it.web.url }
        val uri = url?.let(Uri::parse)
        val secure = uri?.scheme.equals("https", ignoreCase = true)
        val host = uri?.host ?: "Start page"
        val status = when {
            uri == null -> "No website is open."
            secure -> "Connection uses HTTPS."
            uri.scheme.equals("http", ignoreCase = true) ->
                "This connection is not encrypted."
            else -> "This is a local browser page."
        }
        dialog()
            .setTitle(host)
            .setMessage(status)
            .setPositiveButton("OK", null)
            .show()
    }

    private fun navigate(value: String) {
        val text = value.trim()
        if (text.isBlank()) return
        val tab = current() ?: return
        tab.autofillPromptedOrigin = null

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

    private fun adjustZoom(change: Int) {
        val tab = current() ?: return
        val currentZoom = tab.zoom.coerceIn(50, 200)
        val targetZoom = (currentZoom + if (change < 0) -10 else 10).coerceIn(50, 200)
        if (targetZoom == currentZoom) {
            toast("Page zoom limit reached")
            return
        }
        tab.web.zoomBy(targetZoom.toFloat() / currentZoom.toFloat())
        tab.zoom = targetZoom
        prefs.edit().putInt("page_zoom", targetZoom).apply()
        toast("Page zoom: $targetZoom%")
    }

    private fun showTabs() {
        if (tabs.isEmpty()) return
        val list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(8), dp(16), dp(8))
        }
        val scroller = android.widget.ScrollView(this).apply {
            addView(list)
        }
        val prompt = dialog()
            .setTitle("Open tabs")
            .setView(scroller)
            .setPositiveButton("New tab") { _, _ -> addTab() }
            .setNegativeButton("Done", null)
            .show()

        tabs.forEachIndexed { index, tab ->
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            val title = TextView(this).apply {
                text = "${if (index == activeTab) "● " else ""}${tab.title}"
                textSize = 15f
                setTextColor(foregroundColor)
                setSingleLine(true)
                setPadding(dp(8), dp(12), dp(8), dp(12))
                setOnClickListener {
                    activeTab = index
                    showActiveTab()
                    renderTabs()
                    persistSession()
                    prompt.dismiss()
                }
            }
            row.addView(title, LinearLayout.LayoutParams(0, wrapC, 1f))
            row.addView(TextView(this).apply {
                text = "✕"
                textSize = 18f
                setTextColor(foregroundColor)
                setPadding(dp(16), dp(10), dp(8), dp(10))
                setOnClickListener {
                    closeTab(index)
                    prompt.dismiss()
                    showTabs()
                }
            })
            list.addView(row, LinearLayout.LayoutParams(matchP, wrapC))
        }
    }

    private fun persistSession() {
        if (restoringSession || !::security.isInitialized || tabs.isEmpty()) return
        val savedTabs = org.json.JSONArray()
        val savedScrollPositions = org.json.JSONArray()
        tabs.forEach { tab ->
            val url = if (tab.start) null else tab.lastOnlineUrl ?: tab.web.url
            savedTabs.put(
                if (url.isNullOrBlank()) {
                    "start"
                } else if (url.startsWith("https://") || url.startsWith("http://")) {
                    url
                } else {
                    "start"
                }
            )
            savedScrollPositions.put(tab.web.scrollY.coerceAtLeast(0))
        }
        prefs.edit()
            .putString("session_tabs", savedTabs.toString())
            .putString("session_scroll_positions", savedScrollPositions.toString())
            .putInt("session_active_tab", activeTab.coerceIn(0, tabs.lastIndex))
            .apply()
    }

    private fun restoreSession() {
        if (tabs.isNotEmpty()) return
        val encoded = prefs.getString("session_tabs", null) ?: return
        val savedTabs = try {
            org.json.JSONArray(encoded)
        } catch (error: org.json.JSONException) {
            prefs.edit().remove("session_tabs").remove("session_active_tab").apply()
            toast("Could not restore saved tabs: ${error.localizedMessage ?: "invalid session"}", true)
            return
        }
        val savedScrollPositions = try {
            org.json.JSONArray(prefs.getString("session_scroll_positions", "[]"))
        } catch (_: org.json.JSONException) {
            org.json.JSONArray()
        }
        if (savedTabs.length() == 0) return

        restoringSession = true
        try {
            for (index in 0 until minOf(savedTabs.length(), 50)) {
                val url = savedTabs.optString(index)
                val scrollY = savedScrollPositions.optInt(index, 0).coerceAtLeast(0)
                if (url == "start") {
                    addTab(restoreScrollY = scrollY)
                } else if (url.startsWith("https://") || url.startsWith("http://")) {
                    addTab(url, scrollY)
                }
            }
        } finally {
            restoringSession = false
        }
        if (tabs.isEmpty()) {
            prefs.edit().remove("session_tabs").remove("session_active_tab").apply()
            toast("Saved tabs could not be restored", true)
            return
        }
        activeTab = prefs.getInt("session_active_tab", tabs.lastIndex)
            .coerceIn(0, tabs.lastIndex)
        showActiveTab()
        renderTabs()
    }

    private fun displayName(): String =
        if (guestMode) {
            "Guest"
        } else {
            prefs.getString("display_name", null)?.takeIf { it.isNotBlank() }
                ?: security.username()
        }

    private fun changeDisplayName() {
        val input = field("Your name").apply { setText(displayName()) }
        dialog()
            .setTitle("Personalize your start page")
            .setMessage("This name appears in your greeting.")
            .setView(input)
            .setPositiveButton("Save") { _, _ ->
                val name = input.text.toString().trim()
                if (name.isBlank()) {
                    toast("Enter a name")
                } else {
                    prefs.edit().putString("display_name", name.take(60)).apply()
                    current()?.let { if (it.start) loadStart(it.web) }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun chooseTheme() {
        val themes = arrayOf("Light", "Dark")
        dialog()
            .setTitle("Browser theme")
            .setSingleChoiceItems(themes, if (isLightTheme) 0 else 1) { dialog, index ->
                prefs.edit().putString("theme", if (index == 0) "light" else "dark").apply()
                dialog.dismiss()
                showBrowser()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun chooseUserAgent() {
        val choices = userAgents.keys.toTypedArray()
        val selectedAgent = prefs.getString("user_agent", null)
            ?: if (prefs.getBoolean("pcua", true)) "Windows 10/11 · Chrome"
            else "Android · Default"
        dialog()
            .setTitle("User agent")
            .setSingleChoiceItems(choices, choices.indexOf(selectedAgent).coerceAtLeast(0)) { dialog, index ->
                setUserAgent(choices[index])
                dialog.dismiss()
                toast("${choices[index]} user agent selected")
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun chooseLockTimer() {
        val minutes = intArrayOf(0, 1, 5, 15, 30)
        val labels = arrayOf("Off", "1 minute", "5 minutes", "15 minutes", "30 minutes")
        val selected = minutes.indexOf(prefs.getInt("lock_timeout_minutes", 0)).coerceAtLeast(0)
        dialog()
            .setTitle("Lock after inactivity")
            .setSingleChoiceItems(labels, selected) { dialog, index ->
                prefs.edit().putInt("lock_timeout_minutes", minutes[index]).apply()
                dialog.dismiss()
                scheduleAutoLock()
                toast(if (minutes[index] == 0) "Automatic lock disabled" else "Locks after ${labels[index]} of inactivity")
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun scheduleAutoLock() {
        lockRunnable?.let(handler::removeCallbacks)
        lockRunnable = null
        if (!browserVisible || !security.isProtected()) return
        val timeout = prefs.getInt("lock_timeout_minutes", 0)
        if (timeout <= 0) return
        if (lastInteractionAt == 0L) lastInteractionAt = SystemClock.elapsedRealtime()
        val timeoutMs = timeout * 60_000L
        val remaining = (timeoutMs - (SystemClock.elapsedRealtime() - lastInteractionAt)).coerceAtLeast(0L)
        val task = Runnable {
            if (!browserVisible) return@Runnable
            if (SystemClock.elapsedRealtime() - lastInteractionAt >= timeoutMs) {
                showProfileLogin()
                toast("Browser locked after inactivity")
            } else {
                scheduleAutoLock()
            }
        }
        lockRunnable = task
        handler.postDelayed(task, remaining)
    }

    private fun showSavedLogins() {
        val entries = try {
            credentialVault.origins()
        } catch (error: Exception) {
            toast("Could not read saved logins: ${error.localizedMessage ?: "storage error"}", true)
            return
        }
        if (entries.isEmpty()) {
            dialog().setTitle("Saved website logins").setMessage("No logins saved yet. Sign in to an HTTPS website while automatic login saving is enabled.").setPositiveButton("OK", null).show()
            return
        }
        val labels = entries.map { "${it.first} — ${it.second}" }.toTypedArray()
        dialog()
            .setTitle("Saved website logins")
            .setItems(labels) { _, index ->
                val origin = entries[index].first
                dialog()
                    .setTitle(origin)
                    .setItems(arrayOf("Fill login on this page", "Remove saved login")) { _, action ->
                        if (action == 0) {
                            fillSavedLogin(origin)
                        } else {
                            try {
                                credentialVault.remove(origin)
                                toast("Saved login removed")
                            } catch (error: Exception) {
                                toast("Could not remove login: ${error.localizedMessage ?: "storage error"}", true)
                            }
                        }
                    }
                    .show()
            }
            .setNegativeButton("Close", null)
            .show()
    }

    private fun setSaveLogins(enabled: Boolean) {
        prefs.edit().putBoolean("save_logins", enabled).apply()
        tabs.forEach { tab ->
            if (enabled) {
                tab.web.addJavascriptInterface(CredentialBridge(tab.web), "DexBrowseCredentials")
            } else {
                tab.web.removeJavascriptInterface("DexBrowseCredentials")
            }
            tab.web.reload()
        }
        toast(if (enabled) "Website login saving enabled" else "Website login saving disabled")
    }

    // ---------- settings (tap the "DexBrowse By Fuad" title) ----------

    private fun bookmarkEntries(): org.json.JSONArray {
        val encoded = prefs.getString("bookmarks", "[]") ?: "[]"
        return try {
            org.json.JSONArray(encoded)
        } catch (error: org.json.JSONException) {
            toast("Could not read bookmarks: ${error.localizedMessage ?: "invalid data"}", true)
            org.json.JSONArray()
        }
    }

    private fun addCurrentBookmark() {
        val tab = current() ?: return
        val url = tab.lastOnlineUrl ?: tab.web.url
        if (url == null || (!url.startsWith("https://") && !url.startsWith("http://"))) {
            toast("Open a website before adding a bookmark")
            return
        }
        val saved = org.json.JSONArray()
        val existing = bookmarkEntries()
        for (index in 0 until existing.length()) {
            val entry = existing.optJSONObject(index) ?: continue
            if (entry.optString("url") != url) saved.put(entry)
        }
        saved.put(
            JSONObject()
                .put("title", tab.title.ifBlank { url })
                .put("url", url)
        )
        prefs.edit().putString("bookmarks", saved.toString()).apply()
        toast("Bookmark saved")
    }

    private fun removeBookmark(url: String) {
        val saved = org.json.JSONArray()
        val existing = bookmarkEntries()
        for (index in 0 until existing.length()) {
            val entry = existing.optJSONObject(index) ?: continue
            if (entry.optString("url") != url) saved.put(entry)
        }
        prefs.edit().putString("bookmarks", saved.toString()).apply()
    }

    private fun showBookmarks() {
        val entries = bookmarkEntries()
        val list = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(8), dp(16), dp(8))
        }
        val scroller = android.widget.ScrollView(this).apply {
            addView(list)
        }
        if (entries.length() == 0) {
            list.addView(TextView(this).apply {
                text = "No bookmarks yet. Open a page and choose “Bookmark this page”."
                textSize = 14f
                setTextColor(muted)
                setPadding(dp(8), dp(12), dp(8), dp(12))
            })
        }
        val prompt = dialog()
            .setTitle("Bookmarks")
            .setView(scroller)
            .setPositiveButton("Bookmark current page") { _, _ -> addCurrentBookmark() }
            .setNegativeButton("Close", null)
            .show()

        for (index in 0 until entries.length()) {
            val entry = entries.optJSONObject(index) ?: continue
            val titleText = entry.optString("title").ifBlank { entry.optString("url") }
            val url = entry.optString("url")
            if (!url.startsWith("https://") && !url.startsWith("http://")) continue
            val row = LinearLayout(this).apply {
                orientation = LinearLayout.HORIZONTAL
                gravity = Gravity.CENTER_VERTICAL
            }
            row.addView(TextView(this).apply {
                text = titleText
                textSize = 15f
                setTextColor(foregroundColor)
                setSingleLine(true)
                ellipsize = android.text.TextUtils.TruncateAt.END
                setPadding(dp(8), dp(12), dp(8), dp(12))
                setOnClickListener {
                    navigate(url)
                    prompt.dismiss()
                }
            }, LinearLayout.LayoutParams(0, wrapC, 1f))
            row.addView(TextView(this).apply {
                text = "×"
                textSize = 22f
                setTextColor(muted)
                setContentDescription("Remove bookmark")
                setPadding(dp(16), dp(8), dp(8), dp(8))
                setOnClickListener {
                    removeBookmark(url)
                    prompt.dismiss()
                    showBookmarks()
                }
            })
            list.addView(row, LinearLayout.LayoutParams(matchP, wrapC))
        }
    }

    private fun showExtensionsInfo() {
        dialog()
            .setTitle("Extensions")
            .setMessage(
                "Android System WebView does not support browser extensions. " +
                    "Extensions from the Chrome Web Store or other browser stores " +
                    "cannot be installed or managed in DexBrowse."
            )
            .setPositiveButton("OK", null)
            .show()
    }

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
        val options = if (guestMode) {
            arrayOf(
                "Home",
                "Reload",
                "Zoom in",
                "Zoom out",
                "Browsing history",
                "Bookmarks",
                "Bookmark this page",
                "Extensions",
                "Exit guest browser"
            )
        } else arrayOf(
            "Home",
            "Reload",
            "Zoom in",
            "Zoom out",
            "History",
            "Search Engine",
            "Homepage",
            "User Agent",
            "Desktop page layout: " + if (prefs.getBoolean("wide", true)) "ON" else "OFF",
            "Theme: " + if (isLightTheme) "Light" else "Dark",
            "Auto-lock timer",
            "Save website logins automatically: " + if (saveLoginsEnabled()) "ON" else "OFF",
            "Automatically sign in with saved logins: " + if (autoLoginEnabled()) "ON" else "OFF",
            "Manage saved logins",
            "Lock browser",
            "Manage current profile",
            "Add profile",
            "Profile name & passcode",
            "Ad Blocking: " + if (blocker.enabled) "ON" else "OFF",
            "DexAI",
            "About DexBrowse",
            "Bookmarks",
            "Bookmark this page",
            "Extensions"
        )

        dialog()
            .setTitle("DexBrowse Settings")
            .setItems(options) { _, index ->
                if (guestMode) {
                    when (index) {
                        0 -> loadHome()
                        1 -> reloadCurrentPage()
                        2 -> adjustZoom(10)
                        3 -> adjustZoom(-10)
                        4 -> showHistory()
                        5 -> showBookmarks()
                        6 -> addCurrentBookmark()
                        7 -> showExtensionsInfo()
                        8 -> finishGuestSession(showLogin = false, closeApp = true)
                    }
                } else when (index) {
                    0 -> loadHome()
                    1 -> reloadCurrentPage()
                    2 -> adjustZoom(10)
                    3 -> adjustZoom(-10)
                    4 -> showHistory()
                    5 -> showSearchEngines()
                    6 -> changeHomepage()
                    7 -> chooseUserAgent()
                    8 -> setDesktopLayout(!prefs.getBoolean("wide", true))
                    9 -> chooseTheme()
                    10 -> chooseLockTimer()
                    11 -> setSaveLogins(!saveLoginsEnabled())
                    12 -> setAutofillLogins(!autoLoginEnabled())
                    13 -> showSavedLogins()
                    14 -> lockNow()
                    15 -> showProfileManagement()
                    16 -> showCreateProfile()
                    17 -> configureProtection()
                    18 -> toggleAdBlock()
                    19 -> toggleAi()
                    20 -> showAbout()
                    21 -> showBookmarks()
                    22 -> addCurrentBookmark()
                    23 -> showExtensionsInfo()
                }
            }
            .show()
    }

    private fun showProfileManagement() {
        val activeProfile = security.profiles().firstOrNull {
            it.id == security.activeProfileId()
        }
        if (activeProfile == null) {
            toast("The unlocked profile could not be found", true)
            return
        }
        val actions = if (security.profiles().size > 1) {
            arrayOf("Change name or passcode", "Delete this profile")
        } else {
            arrayOf("Change name or passcode")
        }
        dialog()
            .setTitle("Manage ${activeProfile.name}")
            .setItems(actions) { _, index ->
                if (index == 0) {
                    configureProtection()
                } else {
                    confirmProfileDeletion(activeProfile)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun confirmProfileDeletion(profile: SecurityManager.Profile) {
        val passcode = field("Profile passcode", true)
        val box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
            addView(passcode)
        }
        val prompt = dialog()
            .setTitle("Verify ${profile.name}")
            .setMessage("Enter this profile's passcode to continue.")
            .setView(box)
            .setPositiveButton("Continue", null)
            .setNegativeButton("Cancel", null)
            .show()
        prompt.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            if (!security.verifyPassword(passcode.text.toString(), profile.id)) {
                passcode.setText("")
                passcode.error = "Incorrect passcode"
                return@setOnClickListener
            }
            prompt.dismiss()
            dialog()
                .setTitle("Delete ${profile.name}?")
                .setMessage("This permanently removes this profile and its saved browser data.")
                .setPositiveButton("Delete") { _, _ -> deleteProfile(profile) }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }

    private fun deleteProfile(profile: SecurityManager.Profile) {
        if (profile.id != security.activeProfileId()) {
            toast("You can only delete the currently unlocked profile", true)
            return
        }
        if (security.profiles().size <= 1) {
            toast("Keep at least one profile")
            return
        }
        val deletingActiveProfile = profile.id == security.activeProfileId()
        if (deletingActiveProfile) {
            if (browserVisible) persistSession()
            if (profile.id == SecurityManager.DEFAULT_PROFILE_ID) {
                tabs.forEach { it.web.clearCache(true) }
            }
            browserVisible = false
            destroyBrowserSession()
        }

        try {
            if (profile.id == SecurityManager.DEFAULT_PROFILE_ID) {
                CookieManager.getInstance().removeAllCookies(null)
                CookieManager.getInstance().flush()
                WebStorage.getInstance().deleteAllData()
            } else {
                if (!multiProfileSupported()) {
                    if (deletingActiveProfile) showBrowser()
                    toast("Update Android System WebView before deleting this profile", true)
                    return
                }
                if (!ProfileStore.getInstance().deleteProfile(profile.id)) {
                    if (deletingActiveProfile) showBrowser()
                    toast("Android System WebView could not remove this profile", true)
                    return
                }
            }

            CredentialVault(this, profile.id).deleteProfileData()
            check(deleteOfflinePages(profile.id)) { "Offline pages could not be removed" }
            val historyName = if (profile.id == SecurityManager.DEFAULT_PROFILE_ID) {
                "dexbrowse_history"
            } else {
                "dexbrowse_history_${profile.id}"
            }
            val settingsName = if (profile.id == SecurityManager.DEFAULT_PROFILE_ID) {
                "dexbrowse_settings"
            } else {
                "dexbrowse_settings_${profile.id}"
            }
            getSharedPreferences(historyName, MODE_PRIVATE).edit().clear().apply()
            getSharedPreferences(settingsName, MODE_PRIVATE).edit().clear().apply()
            check(security.deleteProfile(profile.id)) { "Profile could not be removed" }
            if (deletingActiveProfile) showProfileLogin()
            toast("Profile deleted")
        } catch (error: Exception) {
            if (deletingActiveProfile) showBrowser()
            toast("Could not delete profile: ${error.localizedMessage ?: "storage error"}", true)
        }
    }

    private fun showSearchEngines() {
        val names = searchEngines.keys.toTypedArray()
        dialog()
            .setTitle("Choose Search Engine")
            .setItems(names) { _, index ->
                prefs.edit()
                    .putString("engine", names[index])
                    .apply()
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

        val username = field("Profile name").apply { setText(security.username()) }
        val password = field("New passcode (no minimum length)", true)
        val recovery = field("Recovery phrase (optional)", true)

        box.addView(username)
        box.addView(password)
        box.addView(recovery)

        val prompt = dialog()
            .setTitle("Profile security")
            .setMessage("A passcode is required, but there is no minimum length. Leave recovery blank to keep the existing phrase.")
            .setView(box)
            .setPositiveButton("Save", null)
            .setNegativeButton("Cancel", null)
            .show()
        prompt.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
            try {
                if (username.text.isBlank() || password.text.isBlank()) {
                    toast("Enter a profile name and a non-empty passcode")
                    return@setOnClickListener
                }
                security.configure(
                    username.text.toString(),
                    password.text.toString(),
                    recovery.text.toString()
                )
                prefs.edit()
                    .putString("display_name", username.text.toString().trim().take(60))
                    .apply()
                toast("Profile updated")
                prompt.dismiss()
            } catch (error: Exception) {
                toast(error.message ?: "Could not update profile", true)
            }
        }
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
        root.setBackgroundColor(bg)
        updateSystemBars()
        root.gravity = Gravity.CENTER

        root.addView(TextView(this).apply {
            text = message
            textSize = 24f
            setTextColor(foregroundColor)
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
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == reqFileChooser) {
            externalFlowInProgress = false
            val callback = fileChooserCallback
            fileChooserCallback = null
            callback?.onReceiveValue(
                if (resultCode == RESULT_OK) {
                    WebChromeClient.FileChooserParams.parseResult(resultCode, data)
                } else {
                    null
                }
            )
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        externalFlowInProgress = false
        when (requestCode) {
            reqWebPermissions -> {
                val request = pendingWebPermission
                pendingWebPermission = null
                if (request != null) {
                    val granted = request.resources.filter { resource ->
                        when (resource) {
                            PermissionRequest.RESOURCE_VIDEO_CAPTURE ->
                                hasPermission(Manifest.permission.CAMERA)
                            PermissionRequest.RESOURCE_AUDIO_CAPTURE ->
                                hasPermission(Manifest.permission.RECORD_AUDIO)
                            else -> true
                        }
                    }
                    if (granted.isEmpty()) request.deny()
                    else request.grant(granted.toTypedArray())
                }
            }
            reqGeolocation -> {
                val callback = pendingGeoCallback
                val origin = pendingGeoOrigin
                pendingGeoCallback = null
                pendingGeoOrigin = null
                val ok = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) ||
                    hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)
                callback?.invoke(origin, ok, false)
            }
            reqStorage -> {
                val saved = pendingDownload
                pendingDownload = null
                if (saved != null && hasPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)) {
                    current()?.web?.let {
                        startDownload(it, saved[0], saved[1], saved[2], saved[3])
                    }
                } else if (saved != null) {
                    toast("Storage permission is needed to save downloads", true)
                }
            }
        }
    }

    @Suppress("DEPRECATION", "OVERRIDE_DEPRECATION")
    override fun onBackPressed() {
        if (customView != null) {
            exitFullscreen()
            return
        }
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
        if (browserVisible) {
            tabs.forEach { tab ->
                tab.lastOnlineUrl?.takeIf {
                    !tab.start && !tab.isOfflinePage &&
                        (it.startsWith("https://") || it.startsWith("http://"))
                }?.let { saveOfflineArchive(tab.web, it) }
            }
            persistSession()
        }
        if (::security.isInitialized) {
            if (guestMode) {
                guestProfileId?.let { id ->
                    ProfileStore.getInstance().getProfile(id)?.cookieManager?.flush()
                }
            } else if (security.activeProfileId() == SecurityManager.DEFAULT_PROFILE_ID) {
                CookieManager.getInstance().flush()
            } else if (multiProfileSupported()) {
                ProfileStore.getInstance()
                    .getProfile(security.activeProfileId())
                    ?.cookieManager
                    ?.flush()
            }
        }
        super.onPause()
    }

    override fun onUserInteraction() {
        super.onUserInteraction()
        if (browserVisible) {
            lastInteractionAt = SystemClock.elapsedRealtime()
            if (guestMode) {
                guestProfileId?.let(::recordGuestProfileUse)
            }
            scheduleAutoLock()
        }
    }

    override fun onResume() {
        super.onResume()
        if (::security.isInitialized) {
            if (
                browserVisible &&
                security.isProtected() &&
                prefs.getInt("lock_timeout_minutes", 0) > 0 &&
                lastInteractionAt > 0L &&
                SystemClock.elapsedRealtime() - lastInteractionAt >=
                    prefs.getInt("lock_timeout_minutes", 0) * 60_000L
            ) {
                showProfileLogin()
                toast("Browser locked after inactivity")
            }
            scheduleAutoLock()
            checkRemoteConfig()
        }
    }

    override fun onStop() {
        // A file picker or a system permission dialog sends the app to the
        // background for a moment; that must not lock the browser.
        if (externalFlowInProgress) {
            super.onStop()
            return
        }
        if (browserVisible && !isChangingConfigurations) {
            tabs.forEach { tab ->
                tab.lastOnlineUrl?.takeIf {
                    !tab.start && !tab.isOfflinePage &&
                        (it.startsWith("https://") || it.startsWith("http://"))
                }?.let { saveOfflineArchive(tab.web, it) }
            }
            persistSession()
        }
        super.onStop()
        if (browserVisible && !isChangingConfigurations) {
            if (guestMode) {
                finishGuestSession(showLogin = false, closeApp = true)
            } else {
                showProfileLogin()
            }
        }
    }

    override fun onDestroy() {
        if (browserVisible) persistSession()
        if (guestMode) finishGuestSession(showLogin = false)
        lockRunnable?.let(handler::removeCallbacks)
        destroyBrowserSession()
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
