import {
    Component,
    For,
    batch,
    createMemo,
    createSignal,
    onMount,
} from 'solid-js';
import './Home.css';
import { appConfig } from '../state';
import { debounce, getIDGenerator, sendMessage } from '../base';
import { A } from '@solidjs/router';
import { createStore } from 'solid-js/store';
import poptip from 'poptip';

interface Word {
    id: number;
    name: string;
    dict: string;
}

const Home: Component = () => {
    const dicts = createMemo(() =>
        appConfig.dicts.filter((item) => item.available)
    );
    const runner = createMemo(() => Math.min(3, dicts().length));
    const [keyword, setKeyword] = createSignal('');
    const [selectedWord, setSelectedWord] = createSignal<Word | null>(null);
    const [words, setWords] = createStore<{ exact: Word[]; fuzzy: Word[] }>({
        exact: [],
        fuzzy: [],
    });
    const result = createMemo(() => [...words.exact, ...words.fuzzy]);
    const [showWords, setShowWords] = createSignal(false);

    const nextSearchId = getIDGenerator();
    let searchId = nextSearchId();

    let serverPort = 0;

    async function _search() {
        const kw = keyword().trim();
        batch(() => {
            setWords({ exact: [], fuzzy: [] });
            setSelectedWord(null);
        });
        iframe.src = '';
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
                prefix_limit: appConfig.prefix_limit,
                phrase_limit: appConfig.phrase_limit,
            });
            if (theSearchId !== searchId) {
                return;
            }
            if (list.length > 0) {
                if (result().length === 0) {
                    setShowWords(true);
                }
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
                        const exactly = wd.toLowerCase() === kw.toLowerCase();
                        if (exactly) {
                            if (exactResults[i] === -1) {
                                exactResults[i] = 1;
                            } else {
                                exactResults[i]++;
                            }
                        }
                        const wl = exactly ? words.exact : words.fuzzy;
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
                        setWords(exactly ? 'exact' : 'fuzzy', [
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
                        selectResult(words.exact[0]);
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

    const search = debounce(_search, 500);

    let iframe: HTMLIFrameElement;

    async function loadEntry(wd: Word) {
        iframe.src = `http://localhost:${serverPort}/@entry?dict_id=${
            wd.id
        }&name=${encodeURIComponent(wd.name)}`;
    }

    let wordsEl: HTMLUListElement;

    function selectResult(wd: Word) {
        setSelectedWord(wd);
        loadEntry(wd);
        setShowWords(false);
        setTimeout(() => {
            wordsEl
                .querySelector('.selected')
                ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }, 0);
    }

    function selectNextResult() {
        const list = result();
        if (list.length === 0) {
            return;
        }
        const wd = selectedWord();
        let idx = wd ? list.indexOf(wd) + 1 : 0;
        if (idx >= list.length) {
            idx = 0;
        }
        selectResult(list[idx]);
    }

    function selectPrevResult() {
        const list = result();
        if (list.length === 0) {
            return;
        }
        const wd = selectedWord();
        let idx = wd ? list.indexOf(wd) - 1 : 0;
        if (idx < 0) {
            idx = list.length - 1;
        }
        selectResult(list[idx]);
    }

    function showShortcut() {
        poptip.info(
            {
                html: [
                    '<p><kbd>Tab</kbd> Next Result</p>',
                    '<p><kbd>Shift</kbd> + <kbd>Tab</kbd> Previous Result</p>',
                    '<p class="mb-0"><kbd>Shift</kbd> + <kbd>Backspace</kbd> Clear Keyword</p>',
                ].join(''),
            },
            { live: 0 }
        );
    }

    onMount(() => {
        sendMessage('get_server_port', undefined).then((port) => {
            serverPort = port;
        });
    });

    return (
        <div class="d-flex flex-column position-fixed top-0 bottom-0 start-0 end-0">
            <header class="flex-shrink-0 p-2 bg-light-subtle d-flex align-items-center position-relative">
                <A href="/settings" class="btn btn-light me-2">
                    <i class="bi bi-gear-wide-connected"></i>
                </A>
                <input
                    type="text"
                    class="form-control form-control text-center bg-light-subtle keyword"
                    placeholder="Search..."
                    value={keyword()}
                    onInput={(e) => {
                        setKeyword(e.target.value);
                        search();
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Tab') {
                            e.preventDefault();
                            if (e.shiftKey) {
                                selectPrevResult();
                            } else {
                                selectNextResult();
                            }
                        } else if (e.key === 'Backspace') {
                            if (e.shiftKey) {
                                e.preventDefault();
                                setKeyword('');
                                search();
                            }
                        }
                    }}
                />
                <button
                    class="btn position-absolute top-0 end-0 m-2"
                    onClick={showShortcut}
                >
                    <i class="bi bi-keyboard-fill"></i>
                </button>
            </header>
            <div class="flex-grow-1 search-result">
                <ul
                    class="search-words"
                    classList={{ show: showWords() }}
                    ref={wordsEl!}
                >
                    <For each={result()}>
                        {(item) => (
                            <li
                                classList={{
                                    selected:
                                        item.id === selectedWord()?.id &&
                                        item.name === selectedWord()?.name,
                                }}
                                onClick={() => selectResult(item)}
                            >
                                {item.name}
                                <p>{item.dict}</p>
                            </li>
                        )}
                    </For>
                </ul>
                <div class="search-details">
                    <div class="details-header">
                        <button class="btn" onClick={() => setShowWords(true)}>
                            <i class="bi bi-list"></i>
                        </button>
                    </div>
                    <section
                        class="details-wrapper"
                        onClick={() => setShowWords(false)}
                    >
                        <iframe src="" ref={iframe!}></iframe>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default Home;
