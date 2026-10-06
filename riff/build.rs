fn main() {
    println!("cargo:rerun-if-env-changed=DUCKDB_STATIC");
    // libduckdb-sys selects libduckdb_static.a, but external static libraries
    // do not carry their C++ runtime dependencies as Cargo link metadata.
    if std::env::var_os("CARGO_FEATURE_BUNDLED_DUCKDB").is_none()
        && std::env::var("DUCKDB_STATIC").is_ok_and(|v| v != "0")
    {
        match std::env::var("CARGO_CFG_TARGET_OS").as_deref() {
            Ok("macos") => println!("cargo:rustc-link-lib=dylib=c++"),
            Ok("linux") => {
                for lib in ["stdc++", "m", "dl", "pthread"] {
                    println!("cargo:rustc-link-lib=dylib={lib}");
                }
            }
            _ => {}
        }
    }
}
