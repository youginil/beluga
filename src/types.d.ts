interface DictItem {
    id: number;
    name: string;
    available: boolean;
}
interface Configuration {
    dict_dir: string;
    dicts: DictItem[];
    cache_size: number;
    win_width: number;
    win_height: number;
    ocr_width: number;
    ocr_height: number;
    ocr_shortcut: string;
    prefix_limit: number;
    phrase_limit: number;
    dev_mode: boolean;
}

interface BookModel {
    id: number;
    name: string;
    create_time: number;
}

interface WordModel {
    id: number;
    name: string;
    familiar: number;
    book_id: number;
    create_time: number;
}

type Pagination<T> = {
    page: number;
    size: number;
    pages: number;
    total: number;
    list: T[];
};

type RR<R, T> = { req: R; res: T };

type IpcMessage = {
    open_devtools: RR<void, void>;
    get_server_port: RR<void, number>;
    search: RR<
        {
            id: number;
            kw: string;
            strict: boolean;
            prefix_limit: number;
            phrase_limit: number;
        },
        string[]
    >;
    resize_cache: RR<number, void>;
    get_settings: RR<void, Configuration>;
    set_settings: RR<Partial<Configuration>, void>;
    reload_dicts: RR<void, void>;
    get_book_list: RR<void, BookModel[]>;
    add_book: RR<string, BookModel>;
    import_book: RR<string, void>;
    update_book: RR<{ id: number; name?: string }, void>;
    delete_book: RR<number[], void>;
    get_book_by_id: RR<number, BookModel | null>;
    get_word_list: RR<
        { book_id: number; page: number; size: number; order?: string },
        Pagination<WordModel>
    >;
    add_word: RR<[number, string], void>;
    delete_words: RR<number[], void>;
    set_word_familiar: RR<{ id: number; familiar: number }, void>;
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
