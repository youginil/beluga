import {
    Component,
    For,
    batch,
    createEffect,
    createMemo,
    createSignal,
    onMount,
} from 'solid-js';
import './Home.css';
import { appConfig } from '../state';
import { debounce, numbers2Uint8Array, sendMessage } from '../base';
import { A } from '@solidjs/router';

const NoDictId = -1;
const DictCache: { id: number; js: string; css: string }[] = [];

const Home: Component = () => {
    const dicts = createMemo(() => appConfig.dicts);
    const [dictId, setDictId] = createSignal(NoDictId);
    const [keyword, setKeyword] = createSignal('');
    const [wdIdx, setWdIdx] = createSignal(-1);
    const [words, setWords] = createSignal<string[]>([]);
    const [showWords, setShowWords] = createSignal(false);

    let dictIdEl: HTMLSelectElement;
    createEffect(() => {
        const ds = dicts();
        if (ds.length > 0) {
            const id = +dictIdEl.value;
            if (!ds.some((item) => item.id === id)) {
                setDictId(ds[0].id);
            }
        } else {
            setDictId(NoDictId);
        }
    });

    async function _search() {
        const kw = keyword().trim();
        if (kw && dictId() !== NoDictId) {
            const list = await sendMessage('search', {
                id: dictId(),
                kw,
                fuzzy_limit: 5,
                result_limit: 20,
            });
            batch(() => {
                setWords(list);
                setWdIdx(0);
                searchWord();
            });
        } else {
            setWords([]);
        }
    }

    const search = debounce(_search, 500);

    let pageEl: HTMLIFrameElement;
    let iframeId = '';

    createEffect(() => {
        if (words().length === 0) {
            pageEl.innerHTML = '';
        }
    });

    async function searchWord() {
        const name = words()[wdIdx()];
        const did = dictId();
        if (did !== NoDictId && name) {
            pageEl.innerHTML = '';
            iframeId = `${Date.now()}-${Math.round(Math.random() * 1000)}`;
            const thisIframeId = iframeId;
            function isWordChanged() {
                return thisIframeId !== iframeId;
            }

            const content = await sendMessage('search_word', [did, name]);
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
            iframe.id = thisIframeId;
            iframe.src = '/definition/index.html';
            pageEl.appendChild(iframe);
            const task1 = DictCache.some((item) => item.id === did)
                ? Promise.resolve()
                : sendMessage('get_static_files', did).then((r) => {
                      if (!DictCache.some((item) => item.id === did)) {
                          DictCache.push({
                              id: did,
                              css: r ? r[0] : '',
                              js: r ? r[1] : '',
                          });
                      }
                  });
            const task2 = new Promise((resolve, reject) => {
                iframe.onload = () => {
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
                    const cache = DictCache.filter(
                        (item) => item.id === did
                    )[0];
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
    }

    onMount(() => {
        window.addEventListener('message', (e) => {
            const { type, name, dictfile } = e.data as ChildMessage;
            console.log('todo', dictfile);
            switch (type) {
                case 'entry':
                    setKeyword(name);
                    search();
                    break;
                case 'resource':
                    const iframeId = pageEl.firstElementChild?.id;
                    sendMessage('search_resource', [dictId(), name]).then(
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
                <A href="/settings" class="btn btn-light btn-lg me-2">
                    <i class="bi bi-gear-wide-connected"></i>
                </A>
                <input
                    type="text"
                    class="form-control form-control-lg text-center bg-light-subtle"
                    placeholder="Search..."
                    value={keyword()}
                    onInput={(e) => {
                        setKeyword(e.target.value);
                        search();
                    }}
                />
            </header>
            <div class="flex-shrink-0 p-2 bg-light-subtle d-flex">
                <button
                    type="button"
                    class="btn btn-sm flex-shrink-0 me-2 show-words"
                    classList={{
                        'btn-primary': showWords(),
                        'btn-outline-primary': !showWords(),
                    }}
                    onClick={() => setShowWords(!showWords())}
                >
                    <i class="bi bi-list-ul"></i>
                </button>
                <select
                    class="form-select form-select-sm bg-light-subtle"
                    value={dictId()}
                    onChange={(e) => {
                        setDictId(+e.target.value);
                        search();
                    }}
                    ref={dictIdEl!}
                >
                    <option value={NoDictId}>choose a dictionary</option>
                    <For each={dicts()}>
                        {(item) => (
                            <option value={item.id} disabled={!item.available}>
                                {item.name}
                            </option>
                        )}
                    </For>
                </select>
            </div>
            <main class="flex-grow-1 search-result">
                <ul class="search-words" classList={{ show: showWords() }}>
                    <For each={words()}>
                        {(item, index) => (
                            <li
                                classList={{ selected: index() === wdIdx() }}
                                onClick={() => {
                                    batch(() => {
                                        setWdIdx(index());
                                        setShowWords(false);
                                    });
                                    searchWord();
                                }}
                            >
                                {item}
                            </li>
                        )}
                    </For>
                </ul>
                <section class="search-details" ref={pageEl!}></section>
            </main>
        </div>
    );
};

export default Home;
