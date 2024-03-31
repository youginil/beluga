use std::{collections::HashMap, path::PathBuf, sync::Arc};

use axum::{
    extract::{Query, State},
    http::{
        header::{self, SET_COOKIE},
        StatusCode, Uri,
    },
    response::{AppendHeaders, Html, IntoResponse},
    routing::get,
    Router,
};
use axum_extra::extract::CookieJar;
use beluga_core::dictionary::{Dictionary, NodeCache};
use serde::Deserialize;
use tauri::AppHandle;
use tokio::{
    fs,
    net::TcpListener,
    sync::{Mutex, RwLock},
};
use tracing::warn;

use crate::{base::get_resource_directory, settings::Settings};

static DICT_COOKIE_NAME: &str = "dict_id";
static DICT_JS_FILE: &str = "entry.js";

#[derive(Clone)]
struct AppState {
    pub dicts: Arc<RwLock<HashMap<u32, Arc<Mutex<Dictionary>>>>>,
    pub cache: Arc<RwLock<NodeCache>>,
    pub settings: Arc<RwLock<Settings>>,
    pub ah: AppHandle,
    pub entry_js_cache: Arc<RwLock<String>>,
    pub static_file_cache: Arc<RwLock<HashMap<PathBuf, Vec<u8>>>>,
}

pub async fn start_server(
    settings: Arc<RwLock<Settings>>,
    dicts: Arc<RwLock<HashMap<u32, Arc<Mutex<Dictionary>>>>>,
    cache: Arc<RwLock<NodeCache>>,
    ah: AppHandle,
) {
    let settings2 = settings.clone();
    let state = AppState {
        settings,
        dicts,
        cache,
        ah,
        entry_js_cache: Arc::new(RwLock::new("".to_string())),
        static_file_cache: Arc::new(RwLock::new(HashMap::new())),
    };
    let app = Router::new()
        .route("/@entry", get(get_entry))
        .route("/@resource", get(get_resource))
        .fallback(get(get_static_file))
        .with_state(state);

    let mut port: u32 = 19000;
    for _ in 0..100 {
        let addr = format!("0.0.0.0:{}", port);
        if let Ok(v) = TcpListener::bind(addr).await {
            let mut settings_lock = settings2.write().await;
            settings_lock.server_port = port;
            drop(settings_lock);
            axum::serve(v, app).await.expect("fail to start server");
            break;
        }
        port += 1;
    }
    panic!("fail to start server due to no available port");
}

#[derive(Deserialize)]
struct EntryQuery {
    dict_id: u32,
    name: String,
}

async fn get_entry(State(state): State<AppState>, params: Query<EntryQuery>) -> impl IntoResponse {
    let dicts_lock = state.dicts.read().await;
    if let Some(dict) = dicts_lock.get(&params.dict_id) {
        let mut dict_lock = dict.lock().await;
        if let Some(content) = dict_lock
            .search_word(state.cache.clone(), &params.name)
            .await
        {
            let js_cache = state.entry_js_cache.read().await;
            let js = if js_cache.is_empty() {
                let static_dir = get_resource_directory(state.ah.clone());
                let jsfile = static_dir.join(DICT_JS_FILE);
                if let Ok(v) = fs::read_to_string(jsfile).await {
                    v
                } else {
                    "".to_string()
                }
            } else {
                js_cache.to_string()
            };
            let (dict_css, dict_js) = if let Ok(v) = dict_lock.get_css_js() {
                v
            } else {
                warn!("fail to get dict css and js");
                ("".to_string(), "".to_string())
            };
            let html = format!(
                "
<!DOCTYPE html>
<html lang=\"en\">
    <head>
        <meta charset=\"UTF-8\" />
        <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
        <title></title>
        <style>{}</style>
        <script>{}</script>
        <script>{}</script>
    </head>
    <body>{}</body>
</html>
            ",
                dict_css, dict_js, js, content
            );
            (
                AppendHeaders([(SET_COOKIE, format!("dict_id={}", params.dict_id))]),
                Html(html),
            )
                .into_response()
        } else {
            StatusCode::NOT_FOUND.into_response()
        }
    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

#[derive(Deserialize)]
struct ResourceQuery {
    name: String,
}

async fn get_resource(
    State(state): State<AppState>,
    params: Query<ResourceQuery>,
    jar: CookieJar,
) -> impl IntoResponse {
    let dict_id = if let Some(v) = jar.get(DICT_COOKIE_NAME) {
        if let Ok(v) = v.value().parse::<u32>() {
            v
        } else {
            return (StatusCode::BAD_REQUEST, "invalid dict id").into_response();
        }
    } else {
        return (StatusCode::BAD_REQUEST, "No dict id in cookie").into_response();
    };
    let dicts_lock = state.dicts.read().await;
    if let Some(dict) = dicts_lock.get(&dict_id) {
        let mut dict_lock = dict.lock().await;
        if let Some(v) = dict_lock
            .search_resource(state.cache.clone(), &params.name)
            .await
        {
            v.into_response()
        } else {
            StatusCode::NOT_FOUND.into_response()
        }
    } else {
        StatusCode::NOT_FOUND.into_response()
    }
}

async fn get_static_file(
    State(state): State<AppState>,
    uri: Uri,
    jar: CookieJar,
) -> impl IntoResponse {
    let dict_id = if let Some(v) = jar.get(DICT_COOKIE_NAME) {
        if let Ok(v) = v.value().parse::<u32>() {
            v
        } else {
            return (StatusCode::BAD_REQUEST, "invalid dict id").into_response();
        }
    } else {
        return (StatusCode::BAD_REQUEST, "No dict id in cookie").into_response();
    };
    let settings_lock = state.settings.read().await;
    let dicts_dir = std::path::Path::new(&settings_lock.config.dict_dir);
    for item in &settings_lock.config.dicts {
        if item.id == dict_id {
            let file = dicts_dir.join(&item.name).join(uri.path());
            let tp = mime_guess::from_path(uri.path()).first_or_octet_stream();
            let mut static_file_cache = state.static_file_cache.write().await;
            if let Some(v) = static_file_cache.get(&file) {
                return ([(header::CONTENT_TYPE, tp.to_string())], v.clone()).into_response();
            }
            if file.is_file() {
                if let Ok(content) = fs::read(&file).await {
                    if content.len() <= 1024 * 1024 {
                        static_file_cache.insert(file, content.clone());
                    }
                    return ([(header::CONTENT_TYPE, tp.to_string())], content).into_response();
                }
            }
            break;
        }
    }
    StatusCode::NOT_FOUND.into_response()
}
