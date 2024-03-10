import { createStore } from 'solid-js/store';

export const [appConfig, setAppConfig] = createStore<Configuration>({
    dict_dir: '',
    dicts: [],
    cache_size: 100,
    key_main: '',
    key_ocr: '',
    win_width: 0,
    win_height: 0,
    ocr_width: 0,
    ocr_height: 0,
});
