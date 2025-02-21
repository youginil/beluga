import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

export const [appConfig, setAppConfig] = createStore<Configuration>({
    dict_dir: '',
    dicts: [],
    cache_size: 100,
    win_width: 0,
    win_height: 0,
    ocr_width: 0,
    ocr_height: 0,
    ocr_shortcut: '',
    prefix_limit: 5,
    phrase_limit: 10,
    dev_mode: false,
});

export const [serverPort, setServerPort] = createSignal(0);
