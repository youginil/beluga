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
import {
    debounce,
    getIDGenerator,
    numbers2Uint8Array,
    sendMessage,
} from '../base';
import { A } from '@solidjs/router';
import { createStore } from 'solid-js/store';

interface Word {
    id: number;
    name: string;
    dict: string;
}

const DictCache: { id: number; js: string; css: string }[] = [];

const Home: Component = () => {
    const runner = createMemo(() => Math.min(3, appConfig.dicts.length));
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

    async function _search() {
        const kw = keyword().trim();
        batch(() => {
            setWords({ exact: [], fuzzy: [] });
            setSelectedWord(null);
        });
        pageEl.innerHTML = '';
        if (!kw) {
            return;
        }

        searchId = nextSearchId();
        const theSearchId = searchId;
        let dictIndex = 0;

        async function searchFromDict(i: number, kw: string) {
            const dict = appConfig.dicts[i];
            const list = await sendMessage('search', {
                id: dict.id,
                kw,
                fuzzy_limit: 5,
                result_limit: 10,
            });
            if (theSearchId !== searchId) {
                return;
            }
            if (list.length > 0) {
                if (result().length === 0) {
                    setShowWords(true);
                }
                batch(() => {
                    for (let j = 0; j < list.length; j++) {
                        const wd = list[j];
                        const item: Word = {
                            id: dict.id,
                            name: wd,
                            dict: dict.name,
                        };
                        if (wd.toLowerCase() === kw.toLowerCase()) {
                            setWords('exact', words.exact.length, item);
                        } else {
                            setWords('fuzzy', words.fuzzy.length, item);
                        }
                    }
                });
                if (selectedWord() === null && words.exact.length > 0) {
                    selectResult(words.exact[0]);
                }
            }
            if (dictIndex < appConfig.dicts.length - 1) {
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

    let pageEl: HTMLIFrameElement;
    let iframeId = '';

    async function searchWord(wd: Word) {
        const { id, name } = wd;
        pageEl.innerHTML = '';
        iframeId = `${Date.now()}-${Math.round(Math.random() * 1000)}`;
        const theIframeId = iframeId;
        const theSearchId = searchId;
        function isWordChanged() {
            return theSearchId !== searchId || theIframeId !== iframeId;
        }

        const content = await sendMessage('search_word', [id, name]);
        if (isWordChanged()) {
            return;
        }
        const div = document.createElement('div');
        div.innerHTML = content ?? '';
        div.querySelectorAll('link').forEach((el) => {
            if (/\.css$/i.test(el.href)) {
                el.remove();
                console.warn(
                    'CSS link should not be included in definition.',
                    name
                );
            }
        });
        div.querySelectorAll('script').forEach((el) => {
            if (/\.js$/i.test(el.src)) {
                el.remove();
                console.warn(
                    'JS link should not be included in definition.',
                    name
                );
            }
        });

        const iframe = document.createElement('iframe');
        iframe.id = theIframeId;
        iframe.src = '/definition/index.html';
        pageEl.appendChild(iframe);
        const task1 = DictCache.some((item) => item.id === id)
            ? Promise.resolve()
            : sendMessage('get_static_files', id).then((r) => {
                  if (!DictCache.some((item) => item.id === id)) {
                      DictCache.push({
                          id: id,
                          css: r ? r[0] : '',
                          js: r ? r[1] : '',
                      });
                  }
              });
        const task2 = new Promise((resolve, reject) => {
            iframe.onload = () => {
                iframe.contentDocument?.addEventListener('click', () => {
                    setShowWords(false);
                });
                resolve(undefined);
            };
            iframe.onerror = (e) => {
                reject(e);
            };
        });
        Promise.all([task1, task2])
            .then(() => {
                if (isWordChanged()) {
                    return;
                }
                const cache = DictCache.filter((item) => item.id === id)[0];
                const iframeDoc = iframe.contentDocument!;
                const style = document.createElement('style');
                style.textContent = cache.css;
                iframeDoc.head.appendChild(style);
                iframeDoc.body.appendChild(div);
                const script = document.createElement('script');
                script.textContent = cache.js;
                iframeDoc.head.appendChild(script);
                // @ts-ignore
                iframe.contentWindow.initPage();
            })
            .catch((e) => {
                console.error('fail to load definition', e);
            });
    }

    let wordsEl: HTMLUListElement;

    function selectResult(wd: Word) {
        setSelectedWord(wd);
        searchWord(wd);
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
        const idx = wd ? list.indexOf(wd) : 0;
        const nextIdx = idx === list.length - 1 ? 0 : idx + 1;
        selectResult(list[nextIdx]);
    }

    function selectPrevResult() {
        const list = result();
        if (list.length === 0) {
            return;
        }
        const wd = selectedWord();
        const idx = wd ? list.indexOf(wd) : 0;
        const prevIdx = idx === 0 ? list.length - 1 : idx - 1;
        selectResult(list[prevIdx]);
    }

    onMount(() => {
        window.addEventListener('message', (e) => {
            const { type, name, dictfile } = e.data as ChildMessage;
            if (dictfile) {
                console.log('todo', dictfile);
            }
            switch (type) {
                case 'entry':
                    setKeyword(name);
                    search();
                    break;
                case 'resource':
                    const iframeId = pageEl.firstElementChild?.id;
                    const wd = selectedWord();
                    if (wd === null) {
                        return;
                    }
                    sendMessage('search_resource', [wd.id, name]).then(
                        (data) => {
                            const iframe =
                                pageEl.firstElementChild as HTMLIFrameElement | null;
                            if (iframe && iframe.id === iframeId) {
                                const msg: ParentMessage = {
                                    name,
                                    data: data
                                        ? numbers2Uint8Array(data)
                                        : false,
                                };
                                iframe.contentWindow?.postMessage(msg);
                            }
                        }
                    );
                    break;
                default:
                    const nop: never = type;
                    console.error('invalid message type', nop);
            }
        });
    });

    return (
        <div class="d-flex flex-column position-fixed top-0 bottom-0 start-0 end-0">
            <header class="flex-shrink-0 p-2 bg-light-subtle d-flex align-items-center">
                <A href="/settings" class="btn btn-light me-2">
                    <i class="bi bi-gear-wide-connected"></i>
                </A>
                <input
                    type="text"
                    class="form-control form-control text-center bg-light-subtle"
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
                        }
                    }}
                />
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
                        ref={pageEl!}
                        onClick={() => setShowWords(false)}
                    ></section>
                </div>
            </div>
        </div>
    );
};

export default Home;
