use crate::{
    error::Result,
    settings::{Configuration, DictItem},
};
use serde::Deserialize;
use tauri::{command, AppHandle, Manager, State};
use tracing::instrument;

use crate::base::AppState;

#[instrument(skip(ah))]
#[command]
pub fn open_devtools(ah: AppHandle) -> Result<()> {
    if let Some(v) = ah.get_window("main") {
        v.open_devtools();
    }
    Ok(())
}

#[instrument(skip(state))]
#[command]
pub async fn get_server_port(state: State<'_, AppState>) -> Result<u32> {
    let settings_lock = state.settings.read().await;
    Ok(settings_lock.server_port)
}

#[derive(Debug, Deserialize)]
pub struct SearchParams {
    pub id: u32,
    pub kw: String,
    pub prefix_limit: usize,
    pub phrase_limit: usize,
}

#[instrument(skip(state))]
#[command]
pub async fn search(state: State<'_, AppState>, req: SearchParams) -> Result<Vec<String>> {
    let dict = if let Some(v) = state.get_dictionary(req.id).await {
        v
    } else {
        return Ok(vec![]);
    };
    let mut d = dict.lock().await;
    let cache = state.cache.clone();
    let r = d
        .search(cache, &req.kw, req.prefix_limit, req.phrase_limit)
        .await;
    Ok(r)
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
pub async fn get_settings(state: State<'_, AppState>) -> Result<Configuration> {
    let settings_lock = state.settings.read().await;
    Ok(settings_lock.config.clone())
}

#[derive(Debug, Deserialize)]
pub struct SettingsParams {
    pub dict_dir: Option<String>,
    pub dicts: Option<Vec<DictItem>>,
    pub cache_size: Option<u32>,
    pub prefix_limit: Option<u32>,
    pub phrase_limit: Option<u32>,
    pub dev_mode: Option<bool>,
}

#[instrument(skip(ah, state))]
#[command]
pub async fn set_settings(
    ah: AppHandle,
    state: State<'_, AppState>,
    req: SettingsParams,
) -> Result<()> {
    let mut settings = state.settings.write().await;
    let mut need_reload = false;
    if let Some(v) = req.dict_dir {
        settings.config.dict_dir = v;
        need_reload = true;
    }
    if let Some(v) = req.dicts {
        settings.config.dicts = v;
    }
    if let Some(v) = req.cache_size {
        settings.config.cache_size = v;
    }
    if let Some(v) = req.prefix_limit {
        settings.config.prefix_limit = v;
    }
    if let Some(v) = req.phrase_limit {
        settings.config.phrase_limit = v;
    }
    if let Some(v) = req.dev_mode {
        settings.config.dev_mode = v;
    }
    settings.save()?;
    drop(settings);

    if need_reload {
        state.load_dictionaries().await?;
    }

    let settings = state.settings.read().await;
    settings.notify_changed(ah);
    Ok(())
}

#[instrument(skip(state))]
#[command]
pub async fn reload_dicts(state: State<'_, AppState>) -> Result<()> {
    state.load_dictionaries().await?;
    Ok(())
}
