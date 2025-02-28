// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{collections::HashMap, fs, io, str::FromStr, sync::Arc};

use base::{get_resource_directory, recognize_text};
use beluga_core::dictionary::NodeCache;
use ocrs::{OcrEngine, OcrEngineParams};
use rten::Model;
use server::start_server;
use tauri::{generate_handler, Emitter, Manager, WindowEvent};
#[cfg(desktop)]
use tauri::{
    menu::{Menu, MenuItem},
    WebviewWindowBuilder,
};

use handlers::{
    add_word, delete_words, get_server_port, get_settings, get_word_list, open_devtools,
    reload_dicts, resize_cache, search, set_settings,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, error, info};
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub async fn run() {
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
            #[cfg(desktop)]
            {
                info!("Init tray");
                let main_menu_item = MenuItem::with_id(app, "main", "Beluga", true, None::<&str>)
                    .expect("fail to create main menu item");
                let quit_menu_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)
                    .expect("fail to create quit menu item");
                let menu = Menu::with_items(app, &[&main_menu_item, &quit_menu_item])
                    .expect("fail to create menu");
                let tray = app.tray_by_id("main").expect("no tray setting");
                tray.set_menu(Some(menu)).expect("fail to set menu");
                tray.on_menu_event(|app, event| match event.id.as_ref() {
                    "main" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.set_focus();
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

                            #[cfg(target_os = "macos")]
                            let _ = app.set_activation_policy(tauri::ActivationPolicy::Regular);
                        };
                    }
                    "quit" => {
                        std::process::exit(0);
                    }
                    _ => {}
                });
            }

            let config_dir = app.path().app_config_dir().unwrap();
            let data_dir = app.path().app_data_dir().unwrap();
            debug!("{:?}, {:?}", config_dir, data_dir);
            info!("Init settings");
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

            info!("Start server");
            let settings2 = settings.clone();
            let dicts2 = dicts.clone();
            let cache2 = cache.clone();
            let ah2 = app.app_handle().clone();
            tokio::spawn(async move {
                start_server(settings2, dicts2, cache2, ah2).await;
            });

            info!("Load OCR engine");
            let ah = app.app_handle();
            let resource_dir = get_resource_directory(ah.clone());
            let detection_model_path = resource_dir.join("text-detection.rten");
            let rec_model_path = resource_dir.join("text-recognition.rten");
            let detection_model =
                Model::load_file(detection_model_path).expect("fail to load detection model");
            let recognition_model =
                Model::load_file(rec_model_path).expect("fail to load recognition model");
            let engine = match OcrEngine::new(OcrEngineParams {
                detection_model: Some(detection_model),
                recognition_model: Some(recognition_model),
                ..Default::default()
            }) {
                Ok(v) => v,
                Err(e) => {
                    panic!("fail to load OCR engine. {}", e);
                }
            };
            let engine = Arc::new(Mutex::new(engine));

            let state = AppState::new(settings, dicts, cache, db, engine);
            app.manage(state);

            info!("Load dictionaries");
            let ah = app.app_handle().clone();
            tokio::spawn(async move {
                let state = ah.state::<AppState>();
                if let Err(e) = state.load_dictionaries().await {
                    panic!("fail to load dictionary. {:?}", e);
                }
                let settings_lock = state.settings.read().await;
                settings_lock.notify_changed(ah.clone());
            });

            #[cfg(desktop)]
            {
                info!("Register global shortcuts");
                app.handle()
                    .plugin(
                        tauri_plugin_global_shortcut::Builder::new()
                            .with_handler(move |ah, shortcut, event| {
                                debug!("{:?}", shortcut);
                                let ah = ah.clone();
                                let sc = *shortcut;
                                tokio::spawn(async move {
                                    let state = ah.state::<AppState>();
                                    let settings_lock = state.settings.read().await;
                                    if let Ok(sc_ocr) =
                                        Shortcut::from_str(&settings_lock.config.ocr_shortcut)
                                    {
                                        if sc == sc_ocr {
                                            match event.state() {
                                                ShortcutState::Pressed => {
                                                    let engine = state.engine.lock().await;
                                                    let ocr_width = settings_lock.config.ocr_width;
                                                    let ocr_height =
                                                        settings_lock.config.ocr_height;
                                                    let text = recognize_text(
                                                        &engine, ocr_width, ocr_height,
                                                    );
                                                    debug!("recognized text: {}", text);
                                                    if let Some(win) = ah.get_webview_window("main")
                                                    {
                                                        if let Err(e) = win.set_focus() {
                                                            error!("fail to focus window. {}", e);
                                                        }
                                                        let _ = ah.emit("ocr_text", text);
                                                    } else {
                                                        let script = format!(
                                                            "window.__OCR_TEXT__ = \"{}\"",
                                                            text
                                                        );
                                                        WebviewWindowBuilder::from_config(
                                                            &ah,
                                                            &ah.config()
                                                                .app
                                                                .windows
                                                                .get(0)
                                                                .expect("no window in config")
                                                                .clone(),
                                                        )
                                                        .expect("fail to build window from config")
                                                        .initialization_script(&script)
                                                        .build()
                                                        .expect("fail to build window")
                                                        .show()
                                                        .expect("fail to show window");

                                                        #[cfg(target_os = "macos")]
                                                        let _ = ah.set_activation_policy(
                                                            tauri::ActivationPolicy::Regular,
                                                        );
                                                    }
                                                }
                                                ShortcutState::Released => {}
                                            }
                                        }
                                    };
                                });
                            })
                            .build(),
                    )
                    .expect("fail to load tauri_plugin_global_shortcut");

                let ah = app.app_handle().clone();
                tokio::spawn(async move {
                    let state = ah.state::<AppState>();
                    let settings_lock = state.settings.read().await;
                    debug!("{}", settings_lock.config.ocr_shortcut);
                    if let Ok(v) = Shortcut::from_str(&settings_lock.config.ocr_shortcut) {
                        if let Err(e) = ah.global_shortcut().register(v) {
                            error!("fail to register ocr shortcut. {}", e);
                        }
                    }
                });
            }

            Ok(())
        })
        .on_window_event(|window, event| match event {
            WindowEvent::Destroyed => {
                #[cfg(target_os = "macos")]
                {
                    let ah = window.app_handle();
                    if ah.webview_windows().is_empty() {
                        let _ = ah.set_activation_policy(tauri::ActivationPolicy::Accessory);
                    }
                }
            }
            _ => {
                //
            }
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
