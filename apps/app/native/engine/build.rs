fn main() {
    // oboe-sys 0.6 ships prebuilt liboboe-ext.a but has its C++ runtime
    // linking commented out, so the cdylib would end up with undefined C++
    // symbols (dlopen fails on "__cxa_pure_virtual"). React Native's bundled
    // libc++_shared.so does not export them either, so link the NDK's static
    // C++ runtime into this library instead.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os == "android" {
        println!("cargo:rustc-link-lib=static=c++_static");
        println!("cargo:rustc-link-lib=static=c++abi");
    }
}
