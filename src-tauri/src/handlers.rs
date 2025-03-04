use crate::{
    base::Pagination,
    error::Result,
    model::{word::WordModel, RowID},
    settings::{Configuration, DictItem},
    utils::current_timestamp,
};
use serde::Deserialize;
use tauri::{command, AppHandle, Manager, State};
use tracing::instrument;

use crate::base::AppState;

#[instrument(skip(ah))]
#[command]
pub fn open_devtools(ah: AppHandle) -> Result<()> {
    if let Some(v) = ah.get_webview_window("main") {
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
    pub strict: bool,
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
        .search(
            cache,
            &req.kw,
            req.strict,
            req.prefix_limit,
            req.phrase_limit,
        )
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
    pub ocr_width: Option<u32>,
    pub ocr_height: Option<u32>,
    pub ocr_shortcut: Option<String>,
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
    if let Some(v) = req.ocr_width {
        settings.config.ocr_width = v;
    }
    if let Some(v) = req.ocr_height {
        settings.config.ocr_height = v;
    }
    if let Some(v) = req.ocr_shortcut {
        settings.config.ocr_shortcut = v;
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

#[derive(Deserialize, Debug)]
pub struct WordListParams {
    pub page: u32,
    pub size: u32,
    pub order: Option<String>,
}

#[instrument(skip(state))]
#[command]
pub async fn get_word_list(
    state: State<'_, AppState>,
    req: WordListParams,
) -> Result<Pagination<WordModel>> {
    let mut page = req.page;
    let size = req.size;
    let mut db = state.db.lock().await;
    let total = WordModel::count(&mut db.conn).await?;
    let pages = ((total as f64) / (size as f64)).ceil() as u32;
    if page > pages {
        page = pages;
    }
    let mut pg: Pagination<WordModel> = Pagination {
        page,
        size,
        pages,
        total,
        list: vec![],
    };
    if total == 0 {
        return Ok(pg);
    }
    let list = WordModel::list(&mut db.conn, page as usize, size as usize, req.order).await?;
    pg.list = list;
    Ok(pg)
}

#[instrument(skip(state))]
#[command]
pub async fn add_word(state: State<'_, AppState>, req: String) -> Result<()> {
    let mut db = state.db.lock().await;
    if WordModel::exist_by_name(&mut db.conn, &req).await? {
        return Ok(());
    }
    let mut word = WordModel {
        id: 0,
        name: req,
        familiar: 0,
        create_time: current_timestamp(),
    };
    word.insert(&mut db.conn).await?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct FamiliarParams {
    pub id: RowID,
    pub familiar: u32,
}

#[instrument(skip(state))]
#[command]
pub async fn set_word_familiar(state: State<'_, AppState>, req: FamiliarParams) -> Result<()> {
    let mut db = state.db.lock().await;
    let word = WordModel {
        id: req.id,
        name: "".to_string(),
        familiar: req.familiar,
        create_time: 0,
    };
    word.update(&mut db.conn, vec!["familiar"]).await?;
    Ok(())
}

#[instrument(skip(state))]
#[command]
pub async fn delete_words(state: State<'_, AppState>, req: Vec<RowID>) -> Result<()> {
    let mut db = state.db.lock().await;
    WordModel::delete(&mut db.conn, &req[..]).await?;
    Ok(())
}
