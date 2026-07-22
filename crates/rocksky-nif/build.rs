fn main() {
    // A NIF's `enif_*` symbols are resolved by the host BEAM at load time, not at
    // link time. macOS' linker rejects undefined symbols by default, so allow
    // dynamic lookup. (Linux ELF permits undefined symbols in shared objects, so
    // no flag is needed there.) Scoped to this crate's cdylib.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        println!("cargo:rustc-cdylib-link-arg=-undefined");
        println!("cargo:rustc-cdylib-link-arg=dynamic_lookup");
    }
}
