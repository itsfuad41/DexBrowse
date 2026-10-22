package com.fuad.dexbrowse

import android.net.Uri
import android.webkit.WebResourceResponse
import java.io.ByteArrayInputStream

class AdBlockManager {

    var enabled = true

    private val blockedDomains = setOf(
        "doubleclick.net",
        "googlesyndication.com",
        "googleadservices.com",
        "adnxs.com",
        "adsrvr.org",
        "taboola.com",
        "outbrain.com"
    )

    var blockedCount = 0
        private set

    fun intercept(url: String): WebResourceResponse? {
        if (!enabled) return null

        val uri = Uri.parse(url)
        if (uri.scheme != "https" && uri.scheme != "http") return null

        val host = uri.host?.lowercase() ?: return null

        val blocked = blockedDomains.any {
            host == it || host.endsWith(".$it")
        }

        if (!blocked) return null

        blockedCount++

        return WebResourceResponse(
            "text/plain",
            "UTF-8",
            ByteArrayInputStream(ByteArray(0))
        )
    }
}
