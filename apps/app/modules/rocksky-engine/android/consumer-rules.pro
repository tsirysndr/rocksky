# Rust exports Java_expo_modules_rockskyengine_NativeEngine_* symbols.
# Keep only this JNI entry point's class and native method names stable.
-keep,allowoptimization class expo.modules.rockskyengine.NativeEngine {
    native <methods>;
}
