use crate::{error::Result, settings::Settings};
use serde::Deserialize;
use tauri::{command, State};
use tracing::instrument;

use crate::base::AppState;

#[derive(Debug, Deserialize)]
pub struct SearchParams {
    pub id: u32,
    pub kw: String,
    pub fuzzy_limit: usize,
    pub result_limit: usize,
}

#[instrument(skip(state))]
#[command]
pub async fn search(state: State<'_, AppState>, req: SearchParams) -> Result<Vec<String>> {
    let dict = if let Some(v) = state.get_dictionary(req.id) {
        v
    } else {
        return Ok(vec![]);
    };
    let mut d = dict.lock().await;
    let cache = state.cache.clone();
    let r = d
        .search(cache, &req.kw, req.fuzzy_limit, req.result_limit)
        .await;
    Ok(r)
}

#[instrument(skip(state))]
#[command]
pub async fn search_word(state: State<'_, AppState>, req: (u32, String)) -> Result<Option<String>> {
    let dict = if let Some(v) = state.get_dictionary(req.0) {
        v
    } else {
        return Ok(None);
    };
    let mut d = dict.lock().await;
    let cache = state.cache.clone();
    let r = d.search_word(cache, &req.1).await;
    Ok(r)
}

#[instrument(skip(state))]
#[command]
pub async fn search_resource(
    state: State<'_, AppState>,
    req: (u32, String),
) -> Result<Option<Vec<u8>>> {
    let dict = if let Some(v) = state.get_dictionary(req.0) {
        v
    } else {
        return Ok(None);
    };
    let mut d = dict.lock().await;
    let cache = state.cache.clone();
    let r = d.search_resource(cache, &req.1).await;
    Ok(r)
}

#[instrument(skip(state))]
#[command]
pub async fn get_static_files(
    state: State<'_, AppState>,
    req: u32,
) -> Result<Option<(String, String)>> {
    let dict = if let Some(v) = state.get_dictionary(req) {
        v
    } else {
        return Ok(None);
    };
    let d = dict.lock().await;
    Ok(Some((d.css.clone(), d.js.clone())))
}

#[instrument(skip(state))]
#[command]
pub async fn resize_cache(state: State<'_, AppState>, req: u64) -> Result<()> {
    let mut cache_lock = state.cache.write().await;
    cache_lock.resize(req);
    Ok(())
}

#[instrument(skip(state))]
#[command]
pub async fn get_settings(state: State<'_, AppState>) -> Result<Settings> {
    let settings_lock = state.settings.lock().await;
    Ok(settings_lock.clone())
}
