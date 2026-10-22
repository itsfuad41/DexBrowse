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

    private fun hash(
        input: String,
        salt: ByteArray
    ): ByteArray {

        val spec = PBEKeySpec(
            input.toCharArray(),
            salt,
            120000,
            256
        )

        return try {

            SecretKeyFactory.getInstance(
                "PBKDF2WithHmacSHA256"
            ).generateSecret(spec).encoded

        } finally {
            spec.clearPassword()
        }
    }

    private fun saveSecret(
        name: String,
        value: String
    ) {

        val salt = ByteArray(16)

        SecureRandom().nextBytes(salt)

        val result = hash(value, salt)

        prefs.edit()
            .putString(
                "${name}_salt",
                Base64.encodeToString(
                    salt,
                    Base64.NO_WRAP
                )
            )
            .putString(
                "${name}_hash",
                Base64.encodeToString(
                    result,
                    Base64.NO_WRAP
                )
            )
            .apply()
    }

    private fun verifySecret(
        name: String,
        value: String
    ): Boolean {

        val saltText = prefs.getString(
            "${name}_salt",
            null
        ) ?: return false

        val expectedText = prefs.getString(
            "${name}_hash",
            null
        ) ?: return false

        return try {

            val salt = Base64.decode(
                saltText,
                Base64.NO_WRAP
            )

            val expected = Base64.decode(
                expectedText,
                Base64.NO_WRAP
            )

            val actual = hash(value, salt)

            MessageDigest.isEqual(
                expected,
                actual
            )

        } catch (_: Exception) {

            false
        }
    }

    fun hasPassword(): Boolean {

        return prefs.contains("password_hash")
    }

    fun savePassword(password: String) {

        require(password.length >= 8)

        saveSecret("password", password)
    }

    fun verifyPassword(password: String): Boolean {

        return verifySecret(
            "password",
            password
        )
    }

    fun saveRecoveryPhrase(phrase: String) {

        require(phrase.length >= 12)

        saveSecret(
            "recovery",
            phrase.trim()
        )
    }

    fun verifyRecoveryPhrase(
        phrase: String
    ): Boolean {

        return verifySecret(
            "recovery",
            phrase.trim()
        )
    }

    fun getUsername(): String {

        return prefs.getString(
            "username",
            "Guest"
        ) ?: "Guest"
    }

    fun setUsername(name: String) {

        prefs.edit()
            .putString(
                "username",
                name.take(60)
            )
            .apply()
    }

    fun getHomePage(): String {

        return prefs.getString(
            "homepage",
            "https://www.google.com"
        ) ?: "https://www.google.com"
    }

    fun setHomePage(url: String) {

        prefs.edit()
            .putString(
                "homepage",
                url
            )
            .apply()
    }

    fun getSearchEngine(): String {

        return prefs.getString(
            "search_engine",
            "Google"
        ) ?: "Google"
    }

    fun setSearchEngine(engine: String) {

        prefs.edit()
            .putString(
                "search_engine",
                engine
            )
            .apply()
    }
}
