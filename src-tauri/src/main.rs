// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::HashMap, fs, io, sync::Arc};

use beluga_core::dictionary::NodeCache;
use server::start_server;
use tauri::{
    api::path::app_log_dir, generate_handler, Config, CustomMenuItem, Manager, SystemTray,
    SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem, WindowBuilder,
};

use handlers::{
    get_server_port, get_settings, open_devtools, reload_dicts, resize_cache, search, set_settings,
};
use tokio::sync::RwLock;
use tracing::debug;
use tracing_subscriber::fmt::format::FmtSpan;

use crate::{base::AppState, settings::Settings};

mod base;
mod error;
mod handlers;
mod server;
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
                    if let Some(win) = app.get_window("main") {
                        win.set_focus().expect("fail to focus window");
                    } else {
                        WindowBuilder::from_config(
                            app,
                            app.config()
                                .tauri
                                .windows
                                .get(0)
                                .expect("no window in config")
                                .clone(),
                        )
                        .build()
                        .expect("fail to create main window")
                        .show()
                        .expect("fail to show main window");
                    };
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
            let cache_size = settings.config.cache_size * 1024 * 1024;
            let cache = Arc::new(RwLock::new(NodeCache::new(cache_size.into())));
            let settings = Arc::new(RwLock::new(settings));
            let dicts = Arc::new(RwLock::new(HashMap::new()));

            let settings2 = settings.clone();
            let dicts2 = dicts.clone();
            let cache2 = cache.clone();
            let ah2 = app.app_handle();
            tokio::spawn(async move {
                start_server(settings2, dicts2, cache2, ah2).await;
            });

            let state = AppState::new(settings, dicts, cache);
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
            get_server_port,
            search,
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
