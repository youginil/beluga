use anyhow::Result;
use mouse_position::mouse_position::Mouse;
use ocrs::{ImageSource, OcrEngine};
use rten_imageproc::PointF;
use serde::Serialize;
use std::path::PathBuf;
use std::{collections::HashMap, fs, path::Path, sync::Arc};
use tauri::{AppHandle, Manager};
use tracing::{debug, error, info, warn};
use xcap::image::{DynamicImage, GenericImageView};

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
    pub engine: Arc<Mutex<OcrEngine>>,
}

impl AppState {
    pub fn new(
        settings: Arc<RwLock<Settings>>,
        dicts: Arc<RwLock<HashMap<u32, Arc<Mutex<Dictionary>>>>>,
        cache: Arc<RwLock<NodeCache>>,
        db: Arc<Mutex<Database>>,
        engine: Arc<Mutex<OcrEngine>>,
    ) -> Self {
        Self {
            last_dict_id: Arc::new(Mutex::new(1)),
            last_cache_id: Arc::new(Mutex::new(1)),
            dicts,
            cache,
            settings,
            db,
            engine,
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
    let dir = ah.path().resource_dir().unwrap().join("resources");
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

pub fn recognize_text(engine: &OcrEngine, w: u32, h: u32) -> String {
    let w = w as i32;
    let h = h as i32;
    let (x, y) = match Mouse::get_mouse_position() {
        Mouse::Position { x, y } => (x, y),
        Mouse::Error => return "".to_string(),
    };
    debug!("Mouse position: {} {} {} {}", x, y, w, h);
    let monitors = if let Ok(v) = xcap::Monitor::all() {
        v
    } else {
        return "".to_string();
    };
    for monitor in monitors {
        let mx = match monitor.x() {
            Ok(v) => v,
            Err(e) => {
                error!("fail to get monitor x. {}", e);
                return "".to_string();
            }
        };
        let my = match monitor.y() {
            Ok(v) => v,
            Err(e) => {
                error!("fail to get monitor y. {}", e);
                return "".to_string();
            }
        };
        let mw = match monitor.width() {
            Ok(v) => v as i32,
            Err(e) => {
                error!("fail to get monitor width. {}", e);
                return "".to_string();
            }
        };
        let mh = match monitor.height() {
            Ok(v) => v as i32,
            Err(e) => {
                error!("fail to get monitor height. {}", e);
                return "".to_string();
            }
        };
        debug!("Screen: {} {}, {} {}", mx, my, mw, mh);
        if x >= mx && x <= mx + mw && y >= my && y <= my + mh {
            if let Ok(img) = monitor.capture_image() {
                let x1 = std::cmp::max(x - w / 2, 0) as u32;
                let y1 = std::cmp::max(y - h / 2, 0) as u32;
                let x2 = std::cmp::min(mx + mw, x + w / 2) as u32;
                let y2 = std::cmp::min(my + mh, y + h / 2) as u32;
                let img2 = DynamicImage::from(img).crop(x1, y1, x2 - x1, y2 - y1);
                // let mut file = std::fs::File::create("/Users/jiaju/Downloads/a.png").unwrap();
                // img2.write_to(&mut file, xcap::image::ImageFormat::Png)
                //     .unwrap();
                let img3 = match ImageSource::from_bytes(img2.as_bytes(), img2.dimensions()) {
                    Ok(v) => v,
                    Err(e) => {
                        error!("fail to new image source from bytes. {}", e);
                        return "".to_string();
                    }
                };
                let ocr_input = match engine.prepare_input(img3) {
                    Ok(v) => v,
                    Err(e) => {
                        error!("fail to prepare input. {}", e);
                        return "".to_string();
                    }
                };
                let word_rects = match engine.detect_words(&ocr_input) {
                    Ok(v) => v,
                    Err(e) => {
                        error!("fail to detect words. {}", e);
                        return "".to_string();
                    }
                };
                let words = word_rects.iter().map(|x| vec![*x]).collect::<Vec<Vec<_>>>();
                if let Ok(wds) = engine.recognize_text(&ocr_input, &words) {
                    let x0 = x as f32 - x1 as f32;
                    let y0 = y as f32 - y1 as f32;
                    for (i, wd) in wds.iter().enumerate() {
                        if let Some(v) = wd {
                            debug!("{:?} {}", word_rects[i], v);
                            if word_rects[i].contains(PointF::from_yx(y0, x0)) {
                                return format!("{}", v);
                            }
                        }
                    }
                }
            }
        }
    }
    "".to_string()
}
