interface DictItem {
    id: number;
    name: string;
    available: boolean;
}
interface Configuration {
    dict_dir: string;
    dicts: DictItem[];
    cache_size: number;
    key_main: string;
    key_ocr: string;
    win_width: number;
    win_height: number;
    ocr_width: number;
    ocr_height: number;
    prefix_limit: number;
    phrase_limit: number;
    dev_mode: boolean;
}

type RR<R, T> = { req: R; res: T };

type IpcMessage = {
    open_devtools: RR<void, void>;
    get_server_port: RR<void, number>;
    search: RR<
        { id: number; kw: string; prefix_limit: number; phrase_limit: number },
        string[]
    >;
    resize_cache: RR<number, void>;
    get_settings: RR<void, Configuration>;
    set_settings: RR<Partial<Configuration>, void>;
    reload_dicts: RR<void, void>;
};

interface ChildMessage {
    type: 'resource' | 'entry';
    name: string;
    dictfile?: string;
}

interface ParentMessage {
    name: string;
    data: Uint8Array | false;
}

interface DictHooks {
    resolve(
        el: Element,
        key: string
    ): { file: string; key: string } | undefined;
}
