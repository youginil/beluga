use crate::{
    base::Pagination,
    error::Result,
    model::{book::BookModel, word::WordModel, RowID},
    settings::{Configuration, DictItem},
    utils::current_timestamp,
};
use serde::Deserialize;
use sqlx::Connection;
use tauri::{command, AppHandle, Manager, State};
use tokio::fs;
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

#[instrument(skip(state))]
#[command]
pub async fn get_book_list(state: State<'_, AppState>) -> Result<Vec<BookModel>> {
    let mut db = state.db.lock().await;
    let mut list = BookModel::list(&mut db.conn, 1, 10000000, None).await?;
    let default_book = BookModel {
        id: 0,
        name: "Favorite".to_string(),
        create_time: 0,
    };
    list.insert(0, default_book);
    Ok(list)
}

#[instrument(skip(state))]
#[command]
pub async fn get_book_by_id(state: State<'_, AppState>, req: RowID) -> Result<Option<BookModel>> {
    let mut db = state.db.lock().await;
    let data = BookModel::get_by_id(&mut db.conn, req).await?;
    Ok(data)
}

#[instrument(skip(state))]
#[command]
pub async fn add_book(state: State<'_, AppState>, req: String) -> Result<BookModel> {
    let mut db = state.db.lock().await;
    let mut book = BookModel {
        id: 0,
        name: req,
        create_time: current_timestamp(),
    };
    book.insert(&mut db.conn).await?;
    Ok(book)
}

#[derive(Deserialize)]
struct BookImport {
    pub name: String,
    pub words: Vec<String>,
}

#[instrument(skip(state))]
#[command]
pub async fn import_book(state: State<'_, AppState>, req: String) -> Result<()> {
    let s = fs::read_to_string(req).await?;
    let books: Vec<BookImport> = serde_json::from_str(&s)?;
    let mut db = state.db.lock().await;
    let mut tx = db.conn.begin().await?;
    let now = current_timestamp();
    for item in books {
        let mut book = BookModel {
            id: 0,
            name: item.name,
            create_time: now,
        };
        let book_id = book.insert(&mut *tx).await?;
        let words = item
            .words
            .iter()
            .map(|x| WordModel {
                id: 0,
                name: x.clone(),
                familiar: 0,
                book_id,
                create_time: now,
            })
            .collect::<Vec<WordModel>>();
        WordModel::bulk_insert(&mut *tx, &words).await?;
    }
    tx.commit().await?;
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct UpdateBookParams {
    pub id: RowID,
    pub name: Option<String>,
}

#[instrument(skip(state))]
#[command]
pub async fn update_book(state: State<'_, AppState>, mut req: UpdateBookParams) -> Result<()> {
    let mut db = state.db.lock().await;
    let mut book = BookModel::default();
    book.id = req.id;
    let mut fields: Vec<&str> = vec![];
    if let Some(v) = req.name.take() {
        book.name = v;
        fields.push("name");
    }
    book.update(&mut db.conn, fields).await?;
    Ok(())
}

#[instrument(skip(state))]
#[command]
pub async fn delete_book(state: State<'_, AppState>, req: Vec<RowID>) -> Result<()> {
    let mut db = state.db.lock().await;
    let mut tx = db.conn.begin().await?;
    BookModel::delete(&mut tx, &req).await?;
    WordModel::delete_by_book_ids(&mut tx, &req).await?;
    tx.commit().await?;
    Ok(())
}

#[derive(Deserialize, Debug)]
pub struct WordListParams {
    pub book_id: RowID,
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
    let book_id = req.book_id;
    let mut page = req.page;
    let size = req.size;
    let mut db = state.db.lock().await;
    let total = WordModel::count(&mut db.conn, book_id).await?;
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
    let list = WordModel::list(
        &mut db.conn,
        book_id,
        page as usize,
        size as usize,
        req.order,
    )
    .await?;
    pg.list = list;
    Ok(pg)
}

#[instrument(skip(state))]
#[command]
pub async fn add_word(state: State<'_, AppState>, req: (RowID, String)) -> Result<()> {
    let (book_id, name) = req;
    let mut db = state.db.lock().await;
    if WordModel::exist_by_name(&mut db.conn, book_id, &name).await? {
        return Ok(());
    }
    let mut word = WordModel {
        id: 0,
        name,
        familiar: 0,
        book_id,
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
        book_id: 0,
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
