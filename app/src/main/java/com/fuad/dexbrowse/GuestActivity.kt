package com.fuad.dexbrowse

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebView as AndroidWebView
import android.widget.LinearLayout
import android.widget.TextView

class GuestActivity : Activity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        AndroidWebView.setDataDirectorySuffix("guest")

        super.onCreate(savedInstanceState)

        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
        }

        layout.addView(TextView(this).apply {
            text = "DexBrowse Guest"
            textSize = 20f
            setPadding(20, 20, 20, 20)
        })

        webView = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            webViewClient = WebViewClient()
            loadUrl("https://www.google.com")
        }

        layout.addView(
            webView,
            LinearLayout.LayoutParams(-1, 0, 1f)
        )

        setContentView(layout)
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
