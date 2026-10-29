# The app's own R8 rules. Valdi's runtime and generated classes are kept by the rules shipped in
# libs/valdi_runtime.aar (proguard.txt); classes that our native code looks up by name use @Keep instead.

# Valdi's JNI_OnLoad registers native methods by name, including ones Java never calls (R8 would drop those and
# loading libvaldi fails with NoSuchMethodError). Its C++ also calls the com.snapchat.client bridge classes by name.
-keepclasseswithmembers class com.snap.valdi.** { native <methods>; }
-keep class com.snapchat.client.** { *; }

# ML Kit (scanCode) creates its component registrars by reflection from the manifest; R8 full mode keeps the classes
# but drops their no-arg constructors.
-keep class * implements com.google.firebase.components.ComponentRegistrar { <init>(); }
