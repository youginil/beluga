#[cfg(not(debug_assertions))]
use std::{env, path::Path};

fn main() {
    tauri_build::build();

    #[cfg(not(debug_assertions))]
    {
        let target_os = env::var("CARGO_CFG_TARGET_OS").unwrap_or_else(|_| "unknown".into());
        let index_path = Path::new("../dist/index.html");

        if index_path.exists() {
            let html = fs::read_to_string(&index_path).expect("Failed to read index.html");
            let injected_html = html.replace(
                "</head>",
                &format!(
                    r#"<script>window.__TARGET_OS__ = "{}";</script></head>"#,
                    target_os
                ),
            );
            fs::write(index_path, injected_html).expect("Failed to write modified index.html");
            println!("✅ Injected target_os ({}) into index.html", target_os);
        } else {
            println!("⚠️ index.html not found at {:?}", index_path);
        }
    }
}
