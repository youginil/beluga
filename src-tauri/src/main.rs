// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::HashMap, fs, io, sync::Arc};

use beluga_core::dictionary::NodeCache;
use server::start_server;
use tauri::{
    generate_handler,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager, WebviewWindowBuilder,
};

use handlers::{
    add_word, delete_words, get_server_port, get_settings, get_word_list, open_devtools,
    reload_dicts, resize_cache, search, set_settings,
};
use tokio::sync::{Mutex, RwLock};
use tracing::debug;
use tracing_subscriber::fmt::format::FmtSpan;

use crate::{base::AppState, database::Database, settings::Settings};

mod base;
mod database;
mod error;
mod handlers;
mod model;
mod server;
mod settings;
mod utils;

#[tokio::main]
async fn main() {
    tauri::async_runtime::set(tokio::runtime::Handle::current());

    let level = if cfg!(debug_assertions) {
        tracing::Level::TRACE
    } else {
        tracing::Level::INFO
    };
    let identifier = "com.youginil.beluga".to_string();
    let subscriber = tracing_subscriber::fmt()
        .with_max_level(level)
        .with_span_events(FmtSpan::NEW | FmtSpan::CLOSE)
        .with_file(true)
        .with_line_number(true)
        .with_target(true);
    let var_name = if cfg!(debug_assertions) {
        subscriber.with_writer(io::stderr).init();
        None
    } else {
        let log_dir = dirs::data_dir().unwrap().join(&identifier).join("logs");
        fs::create_dir_all(&log_dir).expect("Fail to create log directory");
        let file_appender = tracing_appender::rolling::daily(log_dir, "");
        let (non_blocking, guard) = tracing_appender::non_blocking(file_appender);
        subscriber.with_writer(non_blocking).init();
        Some(guard)
    };
    let _wg = var_name;

    let data_dir = dirs::data_dir().unwrap().join(&identifier);
    fs::create_dir_all(&data_dir).expect("fail to create data dir");
    let db = Database::new(data_dir).await;
    let db = Arc::new(Mutex::new(db));

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let main_menu_item = MenuItem::with_id(app, "main", "Beluga", true, None::<&str>)
                .expect("fail to create main menu item");
            let quit_menu_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
                .expect("fail to create quit menu item");
            let menu = Menu::with_items(app, &[&main_menu_item, &quit_menu_item])
                .expect("fail to create menu");
            TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "main" => {
                        if let Some(win) = app.get_webview_window("main") {
                            win.set_focus().expect("fail to focus window");
                        } else {
                            WebviewWindowBuilder::from_config(
                                app,
                                &app.config()
                                    .app
                                    .windows
                                    .get(0)
                                    .expect("no window in config")
                                    .clone(),
                            )
                            .unwrap()
                            .build()
                            .expect("fail to create main window")
                            .show()
                            .expect("fail to show main window");
                        };
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)
                .expect("fail to build tray");

            let config_dir = app.path().app_config_dir().unwrap();
            let data_dir = app.path().app_data_dir().unwrap();
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
            let ah2 = app.app_handle().clone();
            tokio::spawn(async move {
                start_server(settings2, dicts2, cache2, ah2).await;
            });

            let state = AppState::new(settings, dicts, cache, db);
            app.manage(state);

            let ah = app.app_handle().clone();
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
            get_word_list,
            add_word,
            delete_words,
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
