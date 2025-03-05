import {
    Component,
    For,
    Show,
    createSignal,
    onCleanup,
    onMount,
} from 'solid-js';
import BackPage from '../components/BackPage';
import { sendMessage } from '../base';
import './Words.css';
import PopupWord from '../components/PopupWord';
import { createStore } from 'solid-js/store';

enum Familiar {
    DontKnow = 0,
    Know = 1,
    KnowWell = 2,
}

const PageSizeOptions = [100, 200];
const OrderOptions = [
    {
        name: 'Time',
        value: 'time',
    },
    {
        name: 'Name',
        value: 'name',
    },
];

const Words: Component = () => {
    const [pageSize, setPageSize] = createSignal(PageSizeOptions[0]);
    const [order, setOrder] = createSignal(OrderOptions[0].value);
    const [pg, setPg] = createStore<Pagination<WordModel>>({
        page: 1,
        size: pageSize(),
        pages: 0,
        total: 0,
        list: [],
    });

    const [opWord, setOpWord] = createSignal<WordModel | null>(null);

    const [loading, setLoading] = createSignal(false);
    async function getWordList(page: number) {
        try {
            setLoading(true);
            const r = await sendMessage('get_word_list', {
                page,
                size: pageSize(),
                order: order(),
            });
            setPg(r);
        } finally {
            setLoading(false);
        }
    }

    let listEl!: HTMLUListElement;

    const CurrentClass = 'current';
    function setCurrentStyle(word: WordModel) {
        const idx = pg.list.indexOf(word);
        const el = listEl.children[idx];
        const curEl = listEl.querySelector('.' + CurrentClass);
        if (el !== curEl) {
            curEl?.classList.remove(CurrentClass);
            el.classList.add(CurrentClass);
        }
    }

    async function setFamiliar(level: number) {
        const wd = opWord();
        if (wd === null) {
            return;
        }
        await sendMessage('set_word_familiar', { id: wd.id, familiar: level });
        setPg(
            'list',
            (item) => item.id === wd.id,
            'familiar',
            () => level
        );
    }

    async function deleteWord(e: MouseEvent) {
        e.stopPropagation();
        const wd = opWord();
        if (wd === null) {
            return;
        }
        await sendMessage('delete_words', [wd.id]);
        getWordList(pg.page);
    }

    let opsEl!: HTMLDivElement;

    function handleWordMenu(e: MouseEvent, word: WordModel) {
        setOpWord(word);
        opsEl.style.visibility = 'hidden';
        opsEl.style.left = '0';
        setTimeout(() => {
            const x = e.clientX;
            const y = e.clientY;
            const w = window.innerWidth;
            const h = window.innerHeight;
            let left = x;
            let top = y;
            if (x > w - x) {
                left = x - opsEl.clientWidth;
            }
            if (y > h - y) {
                top = y - opsEl.clientHeight;
            }
            opsEl.style.left = `${left}px`;
            opsEl.style.top = `${top}px`;
            opsEl.style.visibility = 'visible';
        }, 0);
    }

    function hideOpsEl() {
        opsEl.style.left = '1000000px';
    }

    onMount(() => {
        getWordList(1);
        document.addEventListener('click', hideOpsEl);
    });

    onCleanup(() => {
        document.removeEventListener('click', hideOpsEl);
    });

    const [word, setWord] = createSignal<string | null>(null);

    return (
        <>
            <BackPage title="Words">
                <div class="h-100 d-flex flex-column responsive-wrapper">
                    <div class="flex-shrink-0 d-flex py-2">
                        <select
                            class="form-select me-1"
                            value={pageSize()}
                            onChange={(e) => {
                                setPageSize(+e.target.value);
                                getWordList(1);
                            }}
                        >
                            <For each={PageSizeOptions}>
                                {(item) => (
                                    <option value={item}>
                                        {item} items per page
                                    </option>
                                )}
                            </For>
                        </select>
                        <select
                            class="form-select ms-1"
                            value={order()}
                            onChange={(e) => {
                                setOrder(e.target.value);
                                getWordList(1);
                            }}
                        >
                            <For each={OrderOptions}>
                                {(item) => (
                                    <option value={item.value}>
                                        Order by {item.name}
                                    </option>
                                )}
                            </For>
                        </select>
                    </div>
                    <div class="flex-grow-1 overflow-y-auto">
                        <Show
                            when={pg.list.length > 0}
                            fallback={
                                <div class="h-100 d-flex justify-content-center align-items-center fs-5">
                                    <i class="bi bi-ban me-2"></i>
                                    No word
                                </div>
                            }
                        >
                            <ul class="word-list" ref={listEl}>
                                <For each={pg.list}>
                                    {(item) => (
                                        <li
                                            classList={{
                                                know:
                                                    item.familiar ===
                                                    Familiar.Know,
                                                'know-well':
                                                    item.familiar ===
                                                    Familiar.KnowWell,
                                            }}
                                            onClick={() => {
                                                setWord(item.name);
                                                setCurrentStyle(item);
                                            }}
                                            onContextMenu={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                setCurrentStyle(item);
                                                handleWordMenu(e, item);
                                                return false;
                                            }}
                                        >
                                            {item.name}
                                        </li>
                                    )}
                                </For>
                            </ul>
                        </Show>
                    </div>
                    <div
                        class="flex-shrink-0 d-flex align-items-center justify-content-between py-2"
                        classList={{ 'd-none': pg.pages <= 1 }}
                    >
                        <span class="me-2">
                            {pg.total} items, P<sub>{pg.page}</sub>
                        </span>
                        <div class="btn-group">
                            <button
                                class="btn btn-outline-success"
                                onClick={() => getWordList(pg.page - 1)}
                                disabled={pg.page === 1 || loading()}
                            >
                                <i class="bi bi-arrow-left"></i>
                            </button>
                            <button
                                class="btn btn-outline-success"
                                onClick={() => getWordList(pg.page + 1)}
                                disabled={pg.page >= pg.pages || loading()}
                            >
                                <i class="bi bi-arrow-right"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div
                    class="btn-group-vertical shadow-lg word-ops"
                    role="group"
                    aria-label="Vertical button group"
                    ref={opsEl}
                >
                    <button
                        type="button"
                        class="btn btn-light"
                        onClick={() => setFamiliar(Familiar.KnowWell)}
                    >
                        Know Well
                    </button>
                    <button
                        type="button"
                        class="btn btn-light"
                        onClick={() => setFamiliar(Familiar.Know)}
                    >
                        Know
                    </button>
                    <button
                        type="button"
                        class="btn btn-light"
                        onClick={() => setFamiliar(Familiar.DontKnow)}
                    >
                        Don't Know
                    </button>
                    <button
                        type="button"
                        class="btn btn-danger"
                        onClick={deleteWord}
                    >
                        Delete
                    </button>
                </div>
            </BackPage>
            <PopupWord word={word()} setWord={setWord}></PopupWord>
        </>
    );
};

export default Words;
