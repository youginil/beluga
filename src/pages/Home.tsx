import {
    Component,
    For,
    batch,
    createEffect,
    createMemo,
    createSignal,
} from 'solid-js';
import './Home.css';
import { Word, debounce, loadEntry, makeSearcher, sendMessage } from '../base';
import { A, useSearchParams } from '@solidjs/router';
import poptip from 'poptip';
import { appConfig } from '../state';

const Home: Component = () => {
    const [keyword, setKeyword] = createSignal('');
    const [showWords, setShowWords] = createSignal(false);

    let kwInput!: HTMLInputElement;
    const [searchParams, _] = useSearchParams();
    function searchByUrlParam(keyword?: string) {
        const kw = keyword ?? decodeURIComponent(searchParams.kw as string);
        setTimeout(() => {
            kwInput.value = kw;
            kwInput.dispatchEvent(new Event('input', { bubbles: true }));
            kwInput.focus();
        }, 100);
    }
    if ('__OCR_TEXT__' in window && window.__OCR_TEXT__) {
        searchByUrlParam(window.__OCR_TEXT__ as string);
        delete window.__OCR_TEXT__;
    } else if (searchParams.kw) {
        searchByUrlParam();
    }
    createEffect(() => {
        if (searchParams.kw) {
            searchByUrlParam();
        }
    });

    let iframe!: HTMLIFrameElement;

    const { search, selectedWord, setSelectedWord, searchResult } =
        makeSearcher(false, appConfig.prefix_limit, appConfig.phrase_limit);
    const result = createMemo(() => [
        ...searchResult.exact,
        ...searchResult.fuzzy,
    ]);
    createEffect(() => {
        const wd = selectedWord();
        if (wd) {
            loadEntry(iframe, wd.id, wd.name);
        } else {
            iframe.src = '';
        }
    });

    const searchWord = debounce(() => {
        search(keyword());
    }, 500);

    let wordsEl!: HTMLUListElement;

    function selectResult(wd: Word) {
        batch(() => {
            setSelectedWord(wd);
            setShowWords(false);
        });
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

    async function addToBook(name: string) {
        await sendMessage('add_word', name);
        poptip.info({ html: `<b>${name}</b> is added` });
    }

    function showShortcut() {
        poptip.info(
            {
                html: [
                    '<p><kbd>Tab</kbd> Next result</p>',
                    '<p><kbd>Shift</kbd> + <kbd>Tab</kbd> Previous result</p>',
                    '<p><kbd>Shift</kbd> + <kbd>Backspace</kbd> Clear keyword</p>',
                    '<p class="mb-0"><kbd>Shift</kbd> + <kbd>Enter</kbd> Add to word book</p>',
                ].join(''),
            },
            { live: 0 }
        );
    }

    return (
        <div class="d-flex flex-column position-fixed top-0 bottom-0 start-0 end-0">
            <header class="flex-shrink-0 p-2 bg-light-subtle d-flex align-items-center">
                <A href="/words" class="btn btn-light me-2">
                    <i class="bi bi-star-fill"></i>
                </A>
                <div class="flex-grow-1 position-relative">
                    <button
                        class="btn me-2 toggle-words"
                        classList={{ 'opacity-25': !showWords() }}
                        onClick={() => setShowWords(!showWords())}
                    >
                        <i class="bi bi-layout-sidebar-inset"></i>
                    </button>
                    <input
                        type="text"
                        class="form-control form-control text-center bg-light-subtle keyword"
                        placeholder="Search..."
                        value={keyword()}
                        ref={kwInput}
                        onInput={(e) => {
                            setKeyword(e.target.value);
                            searchWord();
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
                                    searchWord();
                                }
                            } else if (e.key === 'Enter') {
                                if (e.shiftKey) {
                                    e.preventDefault();
                                    const wd = selectedWord();
                                    if (wd) {
                                        addToBook(wd.name);
                                    }
                                }
                            }
                        }}
                    />
                    <button
                        class="btn position-absolute top-0 end-0 kbd-shortcut"
                        onClick={showShortcut}
                    >
                        <i class="bi bi-keyboard-fill"></i>
                    </button>
                </div>
                <A href="/settings" class="btn btn-light ms-2">
                    <i class="bi bi-gear-wide-connected"></i>
                </A>
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
                                class="d-flex align-items-center"
                                classList={{
                                    selected:
                                        item.id === selectedWord()?.id &&
                                        item.name === selectedWord()?.name,
                                }}
                                onClick={() => selectResult(item)}
                            >
                                <div class="flex-grow-1">
                                    <p class="result-name">{item.name}</p>
                                    <p class="result-dict">{item.dict}</p>
                                </div>
                                <button
                                    title="Add to word book"
                                    class="btn opacity-75 m-2"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        addToBook(item.name);
                                    }}
                                >
                                    <i class="bi bi-star-fill"></i>
                                </button>
                            </li>
                        )}
                    </For>
                </ul>
                <div class="search-details" onClick={() => setShowWords(false)}>
                    <iframe src="" ref={iframe!}></iframe>
                </div>
            </div>
        </div>
    );
};

export default Home;
