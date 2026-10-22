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

    fun isProtected(): Boolean = prefs.contains("password_hash")

    fun username(): String =
        prefs.getString("username", "Guest") ?: "Guest"

    fun setUsername(value: String) {
        prefs.edit().putString("username", value.take(60)).apply()
    }

    private fun derive(value: String, salt: ByteArray): ByteArray {
        val spec = PBEKeySpec(value.toCharArray(), salt, 120000, 256)
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
            .putString("${key}_salt", Base64.encodeToString(salt, Base64.NO_WRAP))
            .putString("${key}_hash", Base64.encodeToString(derive(value, salt), Base64.NO_WRAP))
            .apply()
    }

    private fun verifySecret(key: String, value: String): Boolean {
        return try {
            val salt = Base64.decode(
                prefs.getString("${key}_salt", "") ?: "",
                Base64.NO_WRAP
            )
            val expected = Base64.decode(
                prefs.getString("${key}_hash", "") ?: "",
                Base64.NO_WRAP
            )
            MessageDigest.isEqual(expected, derive(value, salt))
        } catch (_: Exception) {
            false
        }
    }

    fun configure(name: String, password: String, recovery: String) {
        require(password.length >= 8)
        require(recovery.length >= 12)
        setUsername(name)
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
