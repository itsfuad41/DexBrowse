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
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.EditorInfo
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebSettings
import android.widget.Button
import android.widget.EditText
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast

import org.json.JSONObject
import org.json.JSONArray

import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {

    private lateinit var security: SecurityManager

    private lateinit var root: LinearLayout

    private lateinit var address: EditText

    private lateinit var tabBar: LinearLayout

    private lateinit var browserContainer: LinearLayout

    private val tabs = mutableListOf<WebView>()

    private var activeTab = -1

    private var failedAttempts = 0

    private var unlocked = false

    private var disabled = false

    private var minimumVersion = 1

    private var updateUrl = ""

    private val handler = Handler(Looper.getMainLooper())

    private val executor = Executors.newSingleThreadExecutor()

    private val desktopAgent =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/131.0.0.0 Safari/537.36"

    private val searchEngines = mapOf(

        "Google" to
            "https://www.google.com/search?q=",

        "Bing" to
            "https://www.bing.com/search?q=",

        "DuckDuckGo" to
            "https://duckduckgo.com/?q=",

        "Brave" to
            "https://search.brave.com/search?q=",

        "Perplexity" to
            "https://www.perplexity.ai/search?q="
    )

    override fun onCreate(savedInstanceState: Bundle?) {

        super.onCreate(savedInstanceState)

        security = SecurityManager(this)

        root = LinearLayout(this).apply {

            orientation = LinearLayout.VERTICAL

            setBackgroundColor(
                Color.parseColor("#0F172A")
            )
        }

        setContentView(root)

        showLogin()

        checkRemoteConfig()
    }

    private fun button(
        text: String,
        action: () -> Unit
    ): Button {

        return Button(this).apply {

            this.text = text

            setOnClickListener {
                action()
            }
        }
    }

    private fun textInput(
        hint: String,
        password: Boolean = false
    ): EditText {

        return EditText(this).apply {

            this.hint = hint

            setTextColor(Color.WHITE)

            setHintTextColor(Color.LTGRAY)

            if (password) {

                inputType =
                    InputType.TYPE_CLASS_TEXT or
                    InputType.TYPE_TEXT_VARIATION_PASSWORD
            }
        }
    }

    private fun showLogin() {

        unlocked = false

        root.removeAllViews()

        val username = security.getUsername()

        val title = TextView(this).apply {

            text = "Hello, $username"

            textSize = 25f

            gravity = Gravity.CENTER

            setTextColor(Color.WHITE)

            setPadding(20, 100, 20, 40)
        }

        root.addView(title)

        if (!security.hasPassword()) {

            showRegistration()

            return
        }

        val password = textInput(
            "Enter Password",
            true
        )

        root.addView(password)

        root.addView(
            button("UNLOCK DEXBROWSE") {

                if (disabled) {

                    showDisabledScreen()

                    return@button
                }

                if (
                    security.verifyPassword(
                        password.text.toString()
                    )
                ) {

                    failedAttempts = 0

                    openBrowser()

                } else {

                    failedAttempts++

                    password.setText("")

                    Toast.makeText(
                        this,
                        "Incorrect password",
                        Toast.LENGTH_SHORT
                    ).show()

                    if (failedAttempts >= 3) {

                        failedAttempts = 0

                        Toast.makeText(
                            this,
                            "Too many attempts. Try again later.",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                }
            }
        )

        root.addView(
            button("FORGOT PASSWORD") {

                showRecovery()
            }
        )
    }

    private fun showRegistration() {

        val username = textInput(
            "Username or Email"
        )

        val password = textInput(
            "Create Password (8+ characters)",
            true
        )

        val recovery = textInput(
            "Recovery Phrase (12+ characters)"
        )

        root.addView(username)

        root.addView(password)

        root.addView(recovery)

        root.addView(
            button("CREATE ACCOUNT") {

                val name = username.text.toString().trim()

                val pass = password.text.toString()

                val phrase = recovery.text.toString()

                if (
                    name.isBlank() ||
                    pass.length < 8 ||
                    phrase.length < 12
                ) {

                    Toast.makeText(
                        this,
                        "Enter a username, password and recovery phrase",
                        Toast.LENGTH_LONG
                    ).show()

                    return@button
                }

                security.setUsername(name)

                security.savePassword(pass)

                security.saveRecoveryPhrase(phrase)

                openBrowser()
            }
        )
    }

    private fun showRecovery() {

        root.removeAllViews()

        val phrase = textInput(
            "Enter Recovery Phrase",
            true
        )

        val newPassword = textInput(
            "New Password",
            true
        )

        root.addView(phrase)

        root.addView(newPassword)

        root.addView(
            button("RESET PASSWORD") {

                if (
                    security.verifyRecoveryPhrase(
                        phrase.text.toString()
                    ) &&
                    newPassword.text.length >= 8
                ) {

                    security.savePassword(
                        newPassword.text.toString()
                    )

                    showLogin()

                } else {

                    Toast.makeText(
                        this,
                        "Recovery failed",
                        Toast.LENGTH_LONG
                    ).show()
                }
            }
        )

        root.addView(
            button("BACK") {
                showLogin()
            }
        )
    }

    private fun openBrowser() {

        if (disabled) {

            showDisabledScreen()

            return
        }

        if (BuildConfig.VERSION_CODE < minimumVersion) {

            showUpdateScreen()

            return
        }

        unlocked = true

        root.removeAllViews()

        val title = TextView(this).apply {

            text = "DexBrowse By Fuad"

            textSize = 18f

            setTextColor(Color.WHITE)

            setPadding(16, 10, 16, 10)
        }

        root.addView(title)

        val controls = LinearLayout(this).apply {

            orientation = LinearLayout.HORIZONTAL
        }

        controls.addView(
            button("◀") {

                currentWebView()?.let {

                    if (it.canGoBack()) {
                        it.goBack()
                    }
                }
            }
        )

        controls.addView(
            button("▶") {

                currentWebView()?.let {

                    if (it.canGoForward()) {
                        it.goForward()
                    }
                }
            }
        )

        controls.addView(
            button("↻") {

                currentWebView()?.reload()
            }
        )

        controls.addView(
            button("+") {

                addTab(
                    security.getHomePage()
                )
            }
        )

        controls.addView(
            button("⚙") {

                showSettings()
            }
        )

        root.addView(
            HorizontalScrollView(this).apply {
                addView(controls)
            }
        )

        tabBar = LinearLayout(this).apply {

            orientation = LinearLayout.HORIZONTAL
        }

        root.addView(
            HorizontalScrollView(this).apply {
                addView(tabBar)
            }
        )

        val addressRow = LinearLayout(this).apply {

            orientation = LinearLayout.HORIZONTAL
        }

        address = textInput(
            "Search or enter URL"
        )

        address.layoutParams =
            LinearLayout.LayoutParams(
                0,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                1f
            )

        address.imeOptions =
            EditorInfo.IME_ACTION_GO

        address.setSingleLine(true)

        address.setOnEditorActionListener { _, _, _ ->

            navigate(
                address.text.toString()
            )

            true
        }

        addressRow.addView(address)

        addressRow.addView(
            button("GO") {

                navigate(
                    address.text.toString()
                )
            }
        )

        root.addView(addressRow)

        browserContainer = LinearLayout(this).apply {

            orientation = LinearLayout.VERTICAL

            layoutParams =
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    0,
                    1f
                )
        }

        root.addView(browserContainer)

        tabs.clear()

        activeTab = -1

        addTab(
            security.getHomePage()
        )
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun addTab(url: String) {

        val webView = WebView(this)

        webView.settings.apply {

            javaScriptEnabled = true

            domStorageEnabled = true

            useWideViewPort = true

            loadWithOverviewMode = true

            builtInZoomControls = true

            displayZoomControls = false

            userAgentString = desktopAgent

            setSupportZoom(true)
        }

        webView.webViewClient =
            object : WebViewClient() {

                override fun onPageFinished(
                    view: WebView,
                    url: String
                ) {

                    super.onPageFinished(
                        view,
                        url
                    )

                    if (
                        tabs.indexOf(view) == activeTab
                    ) {

                        address.setText(url)
                    }

                    saveHistory(url)
                }
            }

        tabs.add(webView)

        activeTab = tabs.lastIndex

        renderTabs()

        showActiveTab()

        webView.loadUrl(url)
    }

    private fun currentWebView(): WebView? {

        return tabs.getOrNull(activeTab)
    }

    private fun showActiveTab() {

        browserContainer.removeAllViews()

        val webView =
            currentWebView() ?: return

        (webView.parent as? ViewGroup)
            ?.removeView(webView)

        browserContainer.addView(
            webView,
            LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )

        address.setText(
            webView.url ?: ""
        )
    }

    private fun renderTabs() {

        tabBar.removeAllViews()

        tabs.forEachIndexed { index, _ ->

            tabBar.addView(
                button("Tab ${index + 1}") {

                    activeTab = index

                    showActiveTab()
                }
            )
        }
    }

    private fun navigate(input: String) {

        val value = input.trim()

        if (value.isBlank()) return

        val url = when {

            value.startsWith("https://") -> value

            value.startsWith("http://") -> value

            value.contains(".") &&
                !value.contains(" ") -> {

                "https://$value"
            }

            else -> {

                val engine =
                    security.getSearchEngine()

                val base =
                    searchEngines[engine]
                        ?: searchEngines["Google"]!!

                base + Uri.encode(value)
            }
        }

        currentWebView()?.loadUrl(url)
    }

    private fun saveHistory(url: String) {

        if (
            !url.startsWith("https://") &&
            !url.startsWith("http://")
        ) return

        val prefs = getSharedPreferences(
            "dexbrowse_history",
            MODE_PRIVATE
        )

        val history = try {

            JSONArray(
                prefs.getString(
                    "history",
                    "[]"
                )
            )

        } catch (_: Exception) {

            JSONArray()
        }

        history.put(url)

        // Keep only the latest 500 entries.
        val trimmed = JSONArray()

        val start =
            (history.length() - 500)
                .coerceAtLeast(0)

        for (i in start until history.length()) {

            trimmed.put(
                history.optString(i)
            )
        }

        prefs.edit()
            .putString(
                "history",
                trimmed.toString()
            )
            .apply()
    }

    private fun showHistory() {

        val prefs = getSharedPreferences(
            "dexbrowse_history",
            MODE_PRIVATE
        )

        val history = try {

            JSONArray(
                prefs.getString(
                    "history",
                    "[]"
                )
            )

        } catch (_: Exception) {

            JSONArray()
        }

        val items = mutableListOf<String>()

        for (i in history.length() - 1 downTo 0) {

            items.add(
                history.optString(i)
            )
        }

        AlertDialog.Builder(this)
            .setTitle("Browsing History")
            .setItems(
                items.toTypedArray()
            ) { _, index ->

                navigate(items[index])
            }
            .setPositiveButton(
                "Clear History"
            ) { _, _ ->

                AlertDialog.Builder(this)
                    .setTitle("Clear browsing history?")
                    .setMessage(
                        "This removes locally saved history entries."
                    )
                    .setPositiveButton("Clear") { _, _ ->

                        prefs.edit()
                            .remove("history")
                            .apply()
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
            "Change Homepage",
            "Open AI Search",
            "Lock Browser"
        )

        AlertDialog.Builder(this)
            .setTitle("DexBrowse Settings")
            .setItems(options) { _, index ->

                when (index) {

                    0 -> showHistory()

                    1 -> showSearchSettings()

                    2 -> changeHomePage()

                    3 -> navigate(
                        "https://www.perplexity.ai"
                    )

                    4 -> showLogin()
                }
            }
            .show()
    }

    private fun showSearchSettings() {

        val engines =
            searchEngines.keys.toTypedArray()

        AlertDialog.Builder(this)
            .setTitle("Search Engine")
            .setItems(engines) { _, index ->

                security.setSearchEngine(
                    engines[index]
                )
            }
            .show()
    }

    private fun changeHomePage() {

        val input = textInput(
            "Homepage URL"
        )

        input.setText(
            security.getHomePage()
        )

        AlertDialog.Builder(this)
            .setTitle("Change Homepage")
            .setView(input)
            .setPositiveButton("Save") { _, _ ->

                val url = input.text.toString().trim()

                if (url.startsWith("https://")) {

                    security.setHomePage(url)

                } else {

                    Toast.makeText(
                        this,
                        "Use an HTTPS homepage",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun checkRemoteConfig() {

        executor.execute {

            var config: JSONObject? = null

            try {

                val url = URL(
                    "https://raw.githubusercontent.com/" +
                    BuildConfig.GITHUB_REPO +
                    "/main/config.json?t=" +
                    System.currentTimeMillis()
                )

                val connection = url.openConnection()

                connection.connectTimeout = 8000

                connection.readTimeout = 8000

                connection.useCaches = false

                val json = connection
                    .getInputStream()
                    .bufferedReader()
                    .use {
                        it.readText()
                    }

                config = JSONObject(json)

            } catch (_: Exception) {

                // Preserve the existing local state.
            }

            handler.post {

                config?.let {

                    disabled = it.optBoolean(
                        "kill_switch",
                        disabled
                    )

                    minimumVersion = it.optInt(
                        "min_version_code",
                        minimumVersion
                    )

                    updateUrl = it.optString(
                        "update_url",
                        updateUrl
                    )
                }

                when {

                    disabled -> showDisabledScreen()

                    BuildConfig.VERSION_CODE <
                        minimumVersion -> showUpdateScreen()
                }
            }
        }
    }

    private fun showDisabledScreen() {

        unlocked = false

        root.removeAllViews()

        root.addView(
            TextView(this).apply {

                text = "DexBrowse has been disabled."

                textSize = 23f

                gravity = Gravity.CENTER

                setTextColor(Color.RED)
            }
        )
    }

    private fun showUpdateScreen() {

        unlocked = false

        root.removeAllViews()

        root.addView(
            TextView(this).apply {

                text = "Update Required"

                textSize = 25f

                gravity = Gravity.CENTER

                setTextColor(Color.WHITE)
            }
        )

        root.addView(
            button("DOWNLOAD UPDATE") {

                if (updateUrl.startsWith("https://")) {

                    startActivity(
                        Intent(
                            Intent.ACTION_VIEW,
                            Uri.parse(updateUrl)
                        )
                    )
                }
            }
        )
    }

    override fun onResume() {

        super.onResume()

        checkRemoteConfig()
    }

    override fun onDestroy() {

        tabs.forEach {
            it.destroy()
        }

        tabs.clear()

        executor.shutdownNow()

        super.onDestroy()
    }
}
