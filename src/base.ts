import { core } from '@tauri-apps/api';
import poptip from 'poptip';
import { batch, createMemo, createSignal } from 'solid-js';
import { appConfig, serverPort } from './state';
import { createStore } from 'solid-js/store';

export function sendMessage<K extends keyof IpcMessage>(
    channel: K,
    req: IpcMessage[K]['req']
): Promise<IpcMessage[K]['res']> {
    return new Promise((resolve, reject) => {
        core.invoke<IpcMessage[K]['res']>(channel, {
            req,
        })
            .then((res) => {
                // console.log('IPC', channel, req, res);
                resolve(res);
            })
            .catch((e) => {
                // console.log('IPC', channel, req, e);
                poptip.error(`${e}`);
                reject(e);
            });
    });
}

export function debounce<T extends (...args: any[]) => any>(
    f: T,
    delay: number
) {
    let timer: number | null = null;

    return (...args: Parameters<T>) => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = window.setTimeout(() => {
            timer = null;
            f(...args);
        }, delay);
    };
}

export function numbers2Uint8Array(arr: number[]): Uint8Array {
    const r = new Uint8Array(arr.length);
    arr.forEach((n, i) => (r[i] = n));
    return r;
}

export function getIDGenerator() {
    let id = 0;
    return () => {
        if (id === Number.MAX_SAFE_INTEGER) {
            id = 0;
        } else {
            id++;
        }
        return id;
    };
}

export interface Word {
    id: number;
    name: string;
    dict: string;
}

interface SearchResult {
    exact: Word[];
    fuzzy: Word[];
}

export function makeSearcher(
    strict: boolean,
    prefixLimit: number,
    phraseLimit: number
) {
    const [selectedWord, setSelectedWord] = createSignal<Word | null>(null);
    const [searchResult, setSearchResult] = createStore<SearchResult>({
        exact: [],
        fuzzy: [],
    });
    const dicts = createMemo(() =>
        appConfig.dicts.filter((item) => item.available)
    );
    const runner = createMemo(() => Math.min(3, dicts().length));
    const nextSearchId = getIDGenerator();
    let searchId = 0;

    async function search(kw: string) {
        kw = kw.trim();
        batch(() => {
            setSearchResult({ exact: [], fuzzy: [] });
            setSelectedWord(null);
        });
        if (!kw) {
            return;
        }

        searchId = nextSearchId();
        const theSearchId = searchId;
        let dictIndex = 0;
        const exactResults: number[] = new Array(dicts().length).fill(-1);

        async function searchFromDict(i: number, kw: string) {
            const dict = dicts()[i];
            const list = await sendMessage('search', {
                id: dict.id,
                kw,
                strict,
                prefix_limit: prefixLimit,
                phrase_limit: phraseLimit,
            });
            if (theSearchId !== searchId) {
                return;
            }
            if (list.length > 0) {
                let exactIdx = -1;
                let fuzzyIdx = -1;
                batch(() => {
                    for (let j = 0; j < list.length; j++) {
                        const wd = list[j];
                        const item: Word = {
                            id: dict.id,
                            name: wd,
                            dict: dict.name,
                        };
                        const exactly = strict
                            ? wd === kw
                            : wd.toLowerCase() === kw.toLowerCase();
                        if (exactly) {
                            if (exactResults[i] === -1) {
                                exactResults[i] = 1;
                            } else {
                                exactResults[i]++;
                            }
                        }
                        const wl = exactly
                            ? searchResult.exact
                            : searchResult.fuzzy;
                        let targetIdx = exactly ? exactIdx : fuzzyIdx;
                        if (targetIdx === -1) {
                            for (let x = 0; x < wl.length; x++) {
                                const idx = dicts().findIndex(
                                    (v) => v.id === wl[x].id
                                );
                                if (idx > i) {
                                    targetIdx = x;
                                    break;
                                }
                            }
                            if (targetIdx === -1) {
                                targetIdx = wl.length;
                            }
                        } else {
                            targetIdx++;
                        }
                        setSearchResult(exactly ? 'exact' : 'fuzzy', [
                            ...wl.slice(0, targetIdx),
                            item,
                            ...wl.slice(targetIdx),
                        ]);
                        if (exactly) {
                            exactIdx = targetIdx;
                        } else {
                            fuzzyIdx = targetIdx;
                        }
                    }
                });
                if (exactResults[i] === -1) {
                    exactResults[i] = 0;
                }
            } else {
                exactResults[i] = 0;
            }
            for (let n = 0; n < exactResults.length; n++) {
                const v = exactResults[n];
                if (v === -1) {
                    break;
                } else if (v === 0) {
                    continue;
                } else {
                    if (selectedWord() === null) {
                        setSelectedWord(searchResult.exact[0]);
                    }
                    break;
                }
            }
            if (dictIndex < dicts().length - 1) {
                await searchFromDict(++dictIndex, kw);
            }
        }

        for (let i = 0; i < runner(); i++) {
            dictIndex = i;
            searchFromDict(i, kw).catch((e) => {
                console.error('fail to search', e);
            });
        }
    }

    return {
        search,
        selectedWord,
        setSelectedWord,
        searchResult,
    };
}

export async function loadEntry(
    iframe: HTMLIFrameElement,
    dictId: number,
    name: string
) {
    iframe.src = `http://localhost:${serverPort()}/@entry?dict_id=${dictId}&name=${encodeURIComponent(
        name
    )}`;
}
