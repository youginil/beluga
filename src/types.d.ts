interface Configuration {
    dict_dir: string;
    dicts: { id: number; name: string; available: boolean }[];
    cache_size: number;
    key_main: string;
    key_ocr: string;
    win_width: number;
    win_height: number;
    ocr_width: number;
    ocr_height: number;
}

type RR<R, T> = { req: R; res: T };

type IpcMessage = {
    search: RR<
        { id: number; kw: string; fuzzy_limit: number; result_limit: number },
        string[]
    >;
    search_word: RR<[number, string], string | null>;
    search_resource: RR<[number, string], number[] | null>;
    get_static_files: RR<number, [string, string] | null>;
    resize_cache: RR<number, void>;
    get_settings: RR<void, Configuration>;
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
