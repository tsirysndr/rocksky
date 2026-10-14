use std::{env, fs, path::Path};

fn collect(root: &Path, dir: &Path, entries: &mut Vec<(String, String)>) {
    for entry in fs::read_dir(dir).expect("dashboard/dist missing; run bun run build in dashboard")
    {
        let path = entry.unwrap().path();
        if path.is_dir() {
            collect(root, &path, entries);
        } else {
            let key = path
                .strip_prefix(root)
                .unwrap()
                .to_str()
                .unwrap()
                .replace('\\', "/");
            entries.push((key, path.to_str().unwrap().to_owned()));
        }
    }
}

fn main() {
    let root = Path::new(&env::var("CARGO_MANIFEST_DIR").unwrap()).join("dashboard/dist");
    println!("cargo:rerun-if-changed=dashboard/dist");
    assert!(
        root.join("index.html").is_file(),
        "build and commit dashboard/dist first"
    );
    let mut entries = Vec::new();
    collect(&root, &root, &mut entries);
    entries.sort();
    let mut code =
        String::from("fn embedded_asset(path: &str) -> Option<&'static [u8]> { match path {\n");
    for (key, path) in entries {
        code.push_str(&format!("{key:?} => Some(include_bytes!({path:?})),\n"));
    }
    code.push_str("_ => None, } }\n");
    fs::write(
        Path::new(&env::var("OUT_DIR").unwrap()).join("dashboard_assets.rs"),
        code,
    )
    .unwrap();
}
