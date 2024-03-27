// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{fs, io};

use tauri::{
    api::path::app_log_dir, generate_handler, Config, CustomMenuItem, Manager, SystemTray,
    SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem, WindowBuilder,
};

use handlers::{
    get_settings, get_static_files, open_devtools, reload_dicts, resize_cache, search,
    search_resource, search_word, set_settings,
};
use tracing::debug;
use tracing_subscriber::fmt::format::FmtSpan;

use crate::{base::AppState, settings::Settings};

mod base;
mod error;
mod handlers;
mod settings;

#[tokio::main]
async fn main() {
    tauri::async_runtime::set(tokio::runtime::Handle::current());

    let level = if cfg!(debug_assertions) {
        tracing::Level::TRACE
    } else {
        tracing::Level::INFO
    };
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(level)
        .with_span_events(FmtSpan::NEW | FmtSpan::CLOSE)
        .with_file(true)
        .with_line_number(true)
        .with_target(true);
    let _wg = if cfg!(debug_assertions) {
        subscriber.with_writer(io::stderr).init();
        None
    } else {
        let mut config = Config::default();
        config.tauri.bundle.identifier = "beluga".to_string();
        let log_dir = app_log_dir(&config).expect("No log dir");
        fs::create_dir_all(&log_dir).expect("Fail to create log directory");
        let file_appender = tracing_appender::rolling::daily(log_dir, "");
        let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
        subscriber.with_writer(non_blocking).init();
        Some(guard)
    };

    let tray_menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("main".to_string(), "Beluga"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit".to_string(), "Quit"));

    tauri::Builder::default()
        .system_tray(SystemTray::new().with_menu(tray_menu))
        .on_system_tray_event(|app, event| match event {
            SystemTrayEvent::MenuItemClick { id, .. } => match id.as_str() {
                "main" => {
                    let window = if let Some(v) = app.get_window("main") {
                        v
                    } else {
                        WindowBuilder::new(app, "main", Default::default())
                            .title("Beluga")
                            .build()
                            .unwrap()
                    };
                    window.show().unwrap();
                }
                "quit" => {
                    std::process::exit(0);
                }
                _ => {}
            },
            _ => {}
        })
        .setup(|app| {
            let resolver = app.handle().path_resolver();
            let config_dir = resolver.app_config_dir().unwrap();
            let data_dir = resolver.app_data_dir().unwrap();
            debug!("{:?}, {:?}", config_dir, data_dir);
            let settings =
                match Settings::init(config_dir.to_str().unwrap(), data_dir.to_str().unwrap()) {
                    Ok(v) => v,
                    Err(e) => {
                        panic!("fail to init settings. {:?}", e);
                    }
                };
            let state = AppState::new(settings);
            app.manage(state);

            let ah = app.app_handle();
            tokio::spawn(async move {
                let state = ah.state::<AppState>();
                if let Err(e) = state.load_dictionaries().await {
                    panic!("fail to load dictionary. {:?}", e);
                }
                let settings_lock = state.settings.read().await;
                settings_lock.notify_changed(ah.clone());
            });

            Ok(())
        })
        .invoke_handler(generate_handler![
            open_devtools,
            search,
            search_word,
            search_resource,
            get_static_files,
            resize_cache,
            get_settings,
            set_settings,
            reload_dicts,
        ])
        .build(tauri::generate_context!())
        .expect("error while running application")
        .run(|_ah, event| match event {
            tauri::RunEvent::ExitRequested { api, .. } => {
                api.prevent_exit();
            }
            _ => {}
        });
}
