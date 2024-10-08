use anyhow::Result;
use serde::Serialize;
use std::path::PathBuf;
use std::{collections::HashMap, fs, path::Path, sync::Arc};
use tauri::{AppHandle, Manager};
use tracing::{info, warn};

use tokio::sync::{Mutex, RwLock};

use crate::database::Database;
use crate::settings::{DictItem, Settings};

use beluga_core::{
    beluga::EXT_ENTRY,
    dictionary::{Dictionary, NodeCache},
};

pub struct AppState {
    last_dict_id: Arc<Mutex<u32>>,
    last_cache_id: Arc<Mutex<u32>>,
    dicts: Arc<RwLock<HashMap<u32, Arc<Mutex<Dictionary>>>>>,
    pub cache: Arc<RwLock<NodeCache>>,
    pub settings: Arc<RwLock<Settings>>,
    pub db: Arc<Mutex<Database>>,
}

impl AppState {
    pub fn new(
        settings: Arc<RwLock<Settings>>,
        dicts: Arc<RwLock<HashMap<u32, Arc<Mutex<Dictionary>>>>>,
        cache: Arc<RwLock<NodeCache>>,
        db: Arc<Mutex<Database>>,
    ) -> Self {
        Self {
            last_dict_id: Arc::new(Mutex::new(1)),
            last_cache_id: Arc::new(Mutex::new(1)),
            dicts,
            cache,
            settings,
            db,
        }
    }

    pub async fn load_dictionaries(&self) -> Result<()> {
        let settings_lock = self.settings.read().await;
        let dir = settings_lock.config.dict_dir.clone();
        drop(settings_lock);

        let dir_path = Path::new(&dir);
        if !dir_path.exists() || !dir_path.is_dir() {
            fs::create_dir_all(dir_path)?;
        }

        let mut dicts_lock = self.dicts.write().await;
        dicts_lock.clear();
        drop(dicts_lock);

        let mut rd = fs::read_dir(&dir)?;
        let word_filename = format!("index.{}", EXT_ENTRY);
        let mut list: Vec<(u32, String)> = vec![];
        while let Some(Ok(item)) = rd.next() {
            let is_dir = item.file_type().is_ok_and(|x| x.is_dir());
            if !is_dir {
                continue;
            }
            let name = item.file_name().to_str().unwrap().to_string();
            let word_filepath = dir_path.join(item.file_name()).join(&word_filename);
            match self.add_dictionary(&word_filepath.to_str().unwrap()).await {
                Ok(v) => list.push((v, name)),
                Err(e) => {
                    warn!("fail to load dictionary: {:?}. {:?}", &word_filepath, e);
                }
            }
        }
        let mut settings_lock = self.settings.write().await;
        settings_lock.config.dicts.retain(|x| {
            if let Some(_) = list.iter().position(|y| y.1.eq(&x.name)) {
                true
            } else {
                false
            }
        });
        for (id, name) in &list {
            if let Some(i) = settings_lock
                .config
                .dicts
                .iter()
                .position(|x| x.name.eq(name))
            {
                settings_lock.config.dicts[i].id = *id;
            } else {
                settings_lock.config.dicts.push(DictItem {
                    id: *id,
                    name: name.clone(),
                    available: true,
                });
            }
        }
        settings_lock.save()?;
        Ok(())
    }

    async fn add_dictionary(&self, file: &str) -> Result<u32> {
        let mut last_cache_id = self.last_cache_id.lock().await;
        let (dict, cache_id) = Dictionary::new(file, *last_cache_id).await?;
        *last_cache_id = cache_id + 1;
        let mut last_dict_id = self.last_dict_id.lock().await;
        let mut dicts_lock = self.dicts.write().await;
        let dict_id = *last_dict_id;
        dicts_lock.insert(dict_id, Arc::new(Mutex::new(dict)));
        *last_dict_id += 1;
        info!("dict ID: {}", dict_id);
        Ok(dict_id)
    }

    pub async fn get_dictionary(&self, id: u32) -> Option<Arc<Mutex<Dictionary>>> {
        let dicts_lock = self.dicts.read().await;
        if let Some(v) = dicts_lock.get(&id) {
            Some(v.clone())
        } else {
            None
        }
    }
}

pub fn get_resource_directory(ah: AppHandle) -> PathBuf {
    #[cfg(debug_assertions)]
    let dir = ah.path().resource_dir().unwrap().join("../../resources");
    #[cfg(not(debug_assertions))]
    let dir = ah.path().resource_dir().unwrap();
    dir
}

#[derive(Serialize)]
pub struct Pagination<T> {
    pub page: u32,
    pub size: u32,
    pub pages: u32,
    pub total: u32,
    pub list: Vec<T>,
}
