use anyhow::Result;
use std::{collections::HashMap, fs, path::Path, sync::Arc};
use tracing::{info, warn};

use tokio::sync::{Mutex, RwLock};

use crate::settings::Settings;

use beluga_core::beluga::{Metadata, EXT_WORD};
use beluga_core::dictionary::{Dictionary, NodeCache};

pub struct AppState {
    last_dict_id: u32,
    last_cache_id: u32,
    dicts: HashMap<u32, Arc<Mutex<Dictionary>>>,
    pub cache: Arc<RwLock<NodeCache>>,
    pub settings: Arc<Mutex<Settings>>,
}

impl AppState {
    pub fn new(settings: Settings) -> Self {
        let cache_size = settings.cache_size * 1024 * 1024;
        Self {
            last_dict_id: 1,
            last_cache_id: 1,
            dicts: HashMap::new(),
            cache: Arc::new(RwLock::new(NodeCache::new(cache_size.into()))),
            settings: Arc::new(Mutex::new(settings)),
        }
    }

    pub fn load_dictionaries(&mut self, dir: &str) -> Result<()> {
        let dir_path = Path::new(dir);
        if !dir_path.exists() || !dir_path.is_dir() {
            return Ok(());
        }
        self.dicts.clear();
        let mut rd = fs::read_dir(dir)?;
        let ext = format!(".{}", EXT_WORD);
        while let Some(Ok(item)) = rd.next() {
            if let Some(name) = item.file_name().to_str() {
                if name.ends_with(&ext) {
                    let file_path = dir_path.join(name);
                    if let Err(e) = self.add_dictionary(file_path.to_str().unwrap()) {
                        warn!("fail to load dictionary: {}. {:?}", name, e);
                    }
                }
            }
        }
        Ok(())
    }

    fn add_dictionary(&mut self, path: &str) -> Result<(u32, Metadata)> {
        let (dict, cache_id) = Dictionary::new(path, self.last_cache_id)?;
        let metadata = dict.metadata();
        self.last_cache_id = cache_id + 1;
        let dict_id = self.last_dict_id;
        self.dicts.insert(dict_id, Arc::new(Mutex::new(dict)));
        self.last_dict_id += 1;
        info!("dict ID: {}", dict_id);
        Ok((dict_id, metadata))
    }

    pub fn get_dictionary(&self, id: u32) -> Option<Arc<Mutex<Dictionary>>> {
        if let Some(v) = self.dicts.get(&id) {
            Some(v.clone())
        } else {
            None
        }
    }
}
