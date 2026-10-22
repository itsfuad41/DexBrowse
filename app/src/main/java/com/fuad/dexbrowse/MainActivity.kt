package com.fuad.dexbrowse

import android.annotation.SuppressLint
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
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.HorizontalScrollView
import android.widget.Toast
import org.json.JSONObject
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {

    private lateinit var security: SecurityManager
    private val blocker = AdBlockManager()

    private lateinit var root: LinearLayout
    private lateinit var content: LinearLayout
    private lateinit var address: EditText
    private lateinit var tabStrip: LinearLayout

    private val tabs = mutableListOf<WebView>()
    private var activeTab = -1
    private var wrongAttempts = 0

    private var killed = false
    private var minimumVersion = 1
    private var updateUrl = ""

    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())

    private val windowsUA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/131.0.0.0 Safari/537.36"

    private val engines = linkedMapOf(
        "Google" to "https://www.google.com/search?q=",
        "Bing" to "https://www.bing.com/search?q=",
        "DuckDuckGo" to "https://duckduckgo.com/?q=",
        "Brave" to "https://search.brave.com/search?q=",
        "Perplexity" to "https://www.perplexity.ai/search?q="
    )

    private val prefs by lazy {
        getSharedPreferences("dexbrowse_settings", MODE_PRIVATE)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        security = SecurityManager(this)
        blocker.enabled = prefs.getBoolean("adblock", true)

        root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.WHITE)
        }

        setContentView(root)

        if (security.isProtected()) showLock() else showBrowser()

        checkRemoteConfig()
    }

    private fun button(label: String, action: () -> Unit): Button {
        return Button(this).apply {
            text = label
            setOnClickListener { action() }
        }
    }

    private fun input(hintText: String, secret: Boolean = false): EditText {
        return EditText(this).apply {
            hint = hintText
            if (secret) {
                inputType = InputType.TYPE_CLASS_TEXT or
                    InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
        }
    }

    private fun showLock() {
        root.removeAllViews()

        val greeting = TextView(this).apply {
            text = "Hello, ${security.username()}"
            textSize = 26f
            setPadding(20, 90, 20, 40)
        }

        root.addView(greeting)

        val password = input("Browser Password", true)
        root.addView(password)

        root.addView(button("Unlock") {
            if (security.verifyPassword(password.text.toString())) {
                wrongAttempts = 0
                showBrowser()
            } else {
                wrongAttempts++
                password.setText("")

                if (wrongAttempts >= 2) {
                    wrongAttempts = 0
                    startActivity(Intent(this, GuestActivity::class.java))
                    finish()
                } else {
                    Toast.makeText(this, "Incorrect password", Toast.LENGTH_SHORT).show()
                }
            }
        })

        root.addView(button("Forgot Password") {
            showRecoveryDialog()
        })
    }

    private fun showRecoveryDialog() {
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(20, 10, 20, 10)
        }

        val phrase = input("Recovery Phrase", true)
        val newPassword = input("New Password (8+ characters)", true)

        container.addView(phrase)
        container.addView(newPassword)

        AlertDialog.Builder(this)
            .setTitle("Recover DexBrowse")
            .setView(container)
            .setPositiveButton("Recover") { _, _ ->
                if (
                    security.verifyRecovery(phrase.text.toString()) &&
                    newPassword.text.length >= 8
                ) {
                    security.resetPassword(newPassword.text.toString())
                    Toast.makeText(this, "Password updated", Toast.LENGTH_SHORT).show()
                } else {
                    Toast.makeText(this, "Recovery failed", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showBrowser() {
        root.removeAllViews()

        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.rgb(245, 245, 250))
        }

        header.addView(button("←") {
            current()?.let { if (it.canGoBack()) it.goBack() }
        })

        header.addView(button("→") {
            current()?.let { if (it.canGoForward()) it.goForward() }
        })

        header.addView(button("⌂") {
            current()?.loadUrl("https://www.google.com")
        })

        header.addView(button("+") {
            addTab("https://www.google.com")
        })

        header.addView(button("⋮") {
            showSettings()
        })

        root.addView(HorizontalScrollView(this).apply {
            addView(header)
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

        address = input("Search or enter address").apply {
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
        addTab(prefs.getString("homepage", "https://www.google.com")!!)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun addTab(url: String) {
        val webView = WebView(this)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            userAgentString = windowsUA
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
            ): Boolean {
                return false
            }
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): android.webkit.WebResourceResponse? {
                return request?.url?.toString()?.let {
                    blocker.intercept(it)
                }
            }

            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                if (tabs.indexOf(view) == activeTab) {
                    address.setText(url)
                }
            }
        }

        tabs.add(webView)
        activeTab = tabs.lastIndex
        renderTabs()
        displayTab()
        webView.loadUrl(url)
    }

    private fun current(): WebView? = tabs.getOrNull(activeTab)

    private fun displayTab() {
        val view = current() ?: return
        content.removeAllViews()
        (view.parent as? ViewGroup)?.removeView(view)
        content.addView(view, LinearLayout.LayoutParams(-1, -1))
        address.setText(view.url ?: "")
    }

    private fun renderTabs() {
        tabStrip.removeAllViews()
        tabs.forEachIndexed { index, _ ->
            tabStrip.addView(button("Tab ${index + 1}") {
                activeTab = index
                displayTab()
            })
        }
    }

    private fun navigate(text: String) {
        val value = text.trim()
        if (value.isBlank()) return

        val url = when {
            value.startsWith("https://") -> value
            value.startsWith("http://") -> value
            value.contains(".") && !value.contains(" ") -> "https://$value"
            else -> {
                val selected = prefs.getString("engine", "Google") ?: "Google"
                (engines[selected] ?: engines["Google"]!!) + Uri.encode(value)
            }
        }

        current()?.loadUrl(url)
    }

    private fun showSettings() {
        val items = arrayOf(
            "Search Engine",
            "Ad Blocking",
            "Set Homepage",
            "Enable Password Protection",
            "Lock Browser"
        )

        AlertDialog.Builder(this)
            .setTitle("DexBrowse Settings")
            .setItems(items) { _, which ->
                when (which) {
                    0 -> {
                        val names = engines.keys.toTypedArray()
                        AlertDialog.Builder(this)
                            .setItems(names) { _, selected ->
                                prefs.edit().putString("engine", names[selected]).apply()
                            }
                            .show()
                    }
                    1 -> {
                        blocker.enabled = !blocker.enabled
                        prefs.edit().putBoolean("adblock", blocker.enabled).apply()
                        Toast.makeText(
                            this,
                            "Ad blocking: ${blocker.enabled}",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                    2 -> {
                        val field = input("Homepage URL")
                        field.setText(prefs.getString("homepage", "https://www.google.com"))
                        AlertDialog.Builder(this)
                            .setTitle("Homepage")
                            .setView(field)
                            .setPositiveButton("Save") { _, _ ->
                                val url = field.text.toString()
                                if (url.startsWith("https://")) {
                                    prefs.edit().putString("homepage", url).apply()
                                }
                            }
                            .show()
                    }
                    3 -> configureProtection()
                    4 -> if (security.isProtected()) showLock()
                }
            }
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
            .setTitle("Enable Protection")
            .setView(box)
            .setPositiveButton("Save") { _, _ ->
                try {
                    security.configure(
                        username.text.toString(),
                        password.text.toString(),
                        recovery.text.toString()
                    )
                    Toast.makeText(this, "Protection enabled", Toast.LENGTH_SHORT).show()
                } catch (_: IllegalArgumentException) {
                    Toast.makeText(this, "Password or phrase too short", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun checkRemoteConfig() {
        executor.execute {
            try {
                val jsonText = URL(BuildConfig.CONFIG_URL)
                    .openConnection()
                    .apply {
                        connectTimeout = 8000
                        readTimeout = 8000
                        useCaches = false
                    }
                    .getInputStream()
                    .bufferedReader()
                    .use { it.readText() }

                val obj = JSONObject(jsonText)
                killed = obj.optBoolean("kill_switch", false)
                minimumVersion = obj.optInt("min_version_code", 1)
                updateUrl = obj.optString("update_url", "")

                handler.post {
                    if (killed) showBlocked("DexBrowse is disabled")
                    else if (BuildConfig.VERSION_CODE < minimumVersion) {
                        showBlocked("Update required")
                    }
                }
            } catch (_: Exception) {
                // Network failures should be handled according to
                // the app's configured offline-access policy.
            }
        }
    }

    private fun showBlocked(message: String) {
        root.removeAllViews()
        root.addView(TextView(this).apply {
            text = message
            textSize = 24f
            setPadding(30, 100, 30, 30)
        })

        if (!killed && updateUrl.startsWith("https://")) {
            root.addView(button("Download Update") {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(updateUrl)))
            })
        }
    }

    override fun onResume() {
        super.onResume()
        if (::security.isInitialized) checkRemoteConfig()
    }

    override fun onDestroy() {
        tabs.forEach { it.destroy() }
        executor.shutdownNow()
        super.onDestroy()
    }
}
