import { Component, For, Show, createSignal, onMount } from 'solid-js';
import BackPage from '../components/BackPage';
import { sendMessage } from '../base';
import './Words.css';
import PopupWord from '../components/PopupWord';
import { ask } from '@tauri-apps/plugin-dialog';

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
    const [pg, setPg] = createSignal<Pagination<WordModel>>({
        page: 1,
        size: pageSize(),
        pages: 0,
        total: 0,
        list: [],
    });

    const [loading, setLoading] = createSignal(false);
    async function getWordList(page: number) {
        try {
            setLoading(true);
            const r = await sendMessage('get_word_list', {
                page,
                size: pageSize(),
                order: order(),
            });
            console.log(r);
            setPg(r);
        } finally {
            setLoading(false);
        }
    }

    async function deleteWord(e: MouseEvent, id: number, name: string) {
        e.stopPropagation();
        const yes = await ask(`Delete "${name}"?`, { kind: 'warning' });
        if (yes) {
            await sendMessage('delete_words', [id]);
            getWordList(pg().page);
        }
    }

    onMount(() => {
        getWordList(1);
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
                            when={pg().list.length > 0}
                            fallback={
                                <div class="h-100 d-flex justify-content-center align-items-center fs-5">
                                    <i class="bi bi-ban me-2"></i>
                                    No word
                                </div>
                            }
                        >
                            <ul class="word-list">
                                <For each={pg().list}>
                                    {(item) => (
                                        <li onClick={() => setWord(item.name)}>
                                            {item.name}
                                            <span
                                                class="del-btn"
                                                onClick={(e) =>
                                                    deleteWord(
                                                        e,
                                                        item.id,
                                                        item.name
                                                    )
                                                }
                                            >
                                                <i class="bi bi-x"></i>
                                            </span>
                                        </li>
                                    )}
                                </For>
                            </ul>
                        </Show>
                    </div>
                    <div
                        class="flex-shrink-0 d-flex align-items-center justify-content-between py-2"
                        classList={{ 'd-none': pg().pages <= 1 }}
                    >
                        <span class="me-2">
                            {pg().total} items, P<sub>{pg().page}</sub>
                        </span>
                        <div class="btn-group">
                            <button
                                class="btn btn-outline-success"
                                onClick={() => getWordList(pg().page - 1)}
                                disabled={pg().page === 1 || loading()}
                            >
                                <i class="bi bi-arrow-left"></i>
                            </button>
                            <button
                                class="btn btn-outline-success"
                                onClick={() => getWordList(pg().page + 1)}
                                disabled={pg().page >= pg().pages || loading()}
                            >
                                <i class="bi bi-arrow-right"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </BackPage>
            <PopupWord word={word()} setWord={setWord}></PopupWord>
        </>
    );
};

export default Words;
