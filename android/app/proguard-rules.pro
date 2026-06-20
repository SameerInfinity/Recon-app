# ═══════════════════════════════════════════
# RECON — ProGuard Rules
# ═══════════════════════════════════════════

# ── WebView + Capacitor Bridge ──────────
# Capacitor's JavaScript interface must NOT be obfuscated
-keepclassmembers class com.getcapacitor.** { *; }
-keepclassmembers class com.recon.buildmanager.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }

# ── Supabase / Kotlin Coroutines ────────
-dontwarn kotlinx.coroutines.**
-keep class io.supabase.** { *; }

# ── Preserve line numbers for crash logs ─
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# ── Google Sign-In ──────────────────────
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**
