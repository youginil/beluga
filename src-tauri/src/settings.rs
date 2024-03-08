use anyhow::Result;
use std::{fs, path::Path};

use serde::{Deserialize, Serialize};

fn default_dict_dir() -> String {
    "".to_string()
}

fn default_dicts() -> Vec<DictItem> {
    vec![]
}

fn default_cache_size() -> u32 {
    100
}

fn default_key_main() -> String {
    "Option+Space".to_string()
}

fn default_key_clipboard() -> String {
    "Option+C".to_string()
}

fn default_key_ocr() -> String {
    "Option+X".to_string()
}

fn default_win_width() -> u32 {
    800
}

fn default_win_height() -> u32 {
    650
}

fn default_ocr_width() -> u32 {
    200
}

fn default_ocr_height() -> u32 {
    50
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DictItem {
    pub name: String,
    pub available: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Settings {
    #[serde(default = "default_dict_dir")]
    pub dict_dir: String,
    #[serde(default = "default_dicts")]
    pub dicts: Vec<DictItem>,
    #[serde(default = "default_cache_size")]
    pub cache_size: u32,
    #[serde(default = "default_key_main")]
    pub key_main: String,
    #[serde(default = "default_key_clipboard")]
    pub key_clipboard: String,
    #[serde(default = "default_key_ocr")]
    pub key_ocr: String,
    #[serde(default = "default_win_width")]
    pub win_width: u32,
    #[serde(default = "default_win_height")]
    pub win_height: u32,
    #[serde(default = "default_ocr_width")]
    pub ocr_width: u32,
    #[serde(default = "default_ocr_height")]
    pub ocr_height: u32,
}

impl Settings {
    pub fn init(config_dir: &str, data_dir: &str) -> Result<Self> {
        let config_path = Path::new(config_dir);
        if !config_path.exists() {
            fs::create_dir_all(config_dir)?;
        }
        let config_file = config_path.join("settings.json");
        if config_file.is_file() {
            let s = fs::read_to_string(&config_file)?;
            if let Ok(v) = serde_json::from_str::<Settings>(&s) {
                return Ok(v);
            }
        };
        let dict_dir = Path::new(data_dir).join("dicts");
        let mut settings = serde_json::from_str::<Settings>("{}").unwrap();
        settings.dict_dir = dict_dir.to_str().unwrap().to_string();
        let s = serde_json::to_string(&settings)?;
        fs::write(config_file, s)?;
        Ok(settings)
    }
}
