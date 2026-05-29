# ProGuard rules for SecureFace

# ML Kit and Google Play Services (ignore warnings about unused classes)
-dontwarn com.google.mlkit.vision.common.internal.Detector
-dontwarn com.google.mlkit.vision.**
-dontwarn com.google.android.gms.**

# React Native core keep rules
-keep class com.facebook.react.bridge.Systrace { *; }
-keep class com.facebook.react.devsupport.JSCHeapCapture { *; }
-keep class com.facebook.react.turbomodule.core.interfaces.TurboModule { *; }

# React Native Reanimated
-keep class com.swmansion.reanimated.** { *; }
-dontwarn com.swmansion.reanimated.**

# React Native SQLite Storage
-keep class org.sqlite.** { *; }
-keep class org.sqlite.database.** { *; }
-dontwarn org.sqlite.**

# React Native Camera
-dontwarn com.google.android.gms.vision.**
