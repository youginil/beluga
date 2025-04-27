import {
    Component,
    For,
    Match,
    Show,
    Switch,
    createSignal,
    onMount,
} from 'solid-js';
import BackPage from '../components/BackPage';
import { sendMessage } from '../base';
import PopupWord from '../components/PopupWord';
import { createStore } from 'solid-js/store';
import { useParams } from '@solidjs/router';

enum Familiar {
    DontKnow = 0,
    Know = 1,
    KnowWell = 2,
}

const PageSizeOptions = [20, 50];
const OrderOptions = [
    { name: 'Default', value: '' },
    { name: 'Time', value: 'time' },
    { name: 'Name', value: 'name' },
];

const FamiliarFlag: Component<{ word: WordModel }> = (props) => {
    return (
        <>
            <Switch fallback={''}>
                <Match when={props.word.familiar === Familiar.Know}>
                    <span>👌</span>
                </Match>
                <Match when={props.word.familiar === Familiar.KnowWell}>
                    <span>💯</span>
                </Match>
            </Switch>
        </>
    );
};

const Words: Component = () => {
    const params = useParams();
    const bookId = +params.id;
    const [title, setTitle] = createSignal('');
    const [pageSize, setPageSize] = createSignal(PageSizeOptions[0]);
    const [order, setOrder] = createSignal(OrderOptions[0].value);
    const [pg, setPg] = createStore<Pagination<WordModel>>({
        page: 1,
        size: pageSize(),
        pages: 0,
        total: 0,
        list: [],
    });
    const [word, setWord] = createSignal<string | null>(null);

    const [loading, setLoading] = createSignal(false);
    async function getWordList(page: number) {
        try {
            setLoading(true);
            const r = await sendMessage('get_word_list', {
                book_id: bookId,
                page,
                size: pageSize(),
                order: order(),
            });
            setPg(r);
        } finally {
            setLoading(false);
        }
    }

    async function setFamiliar(wd: WordModel, level: number) {
        await sendMessage('set_word_familiar', { id: wd.id, familiar: level });
        setPg(
            'list',
            (item) => item.id === wd.id,
            'familiar',
            () => level
        );
    }

    async function deleteWord(wd: WordModel) {
        if (wd === null) {
            return;
        }
        await sendMessage('delete_words', [wd.id]);
        getWordList(pg.page);
    }

    onMount(async () => {
        getWordList(1);
        const book = await sendMessage('get_book_by_id', bookId);
        if (book) {
            setTitle(book.name);
        }
    });

    return (
        <>
            <BackPage title={title()} url="/books">
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
                                    No Word
                                </div>
                            }
                        >
                            <ul class="list-group">
                                <For each={pg.list}>
                                    {(item) => (
                                        <li
                                            class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                                            onClick={() => setWord(item.name)}
                                        >
                                            <span>
                                                <FamiliarFlag
                                                    word={item}
                                                ></FamiliarFlag>
                                                {item.name}
                                            </span>
                                            <div
                                                class="dropdown"
                                                onClick={(e) =>
                                                    e.stopPropagation()
                                                }
                                            >
                                                <button
                                                    type="button"
                                                    class="btn btn-ghost"
                                                    data-bs-toggle="dropdown"
                                                    aria-expanded="false"
                                                >
                                                    <i class="bi bi-three-dots"></i>
                                                </button>
                                                <ul class="dropdown-menu">
                                                    <li>
                                                        <a
                                                            class="dropdown-item"
                                                            href="#"
                                                            onClick={() =>
                                                                setFamiliar(
                                                                    item,
                                                                    0
                                                                )
                                                            }
                                                        >
                                                            Don't Know
                                                        </a>
                                                    </li>
                                                    <li>
                                                        <a
                                                            class="dropdown-item"
                                                            href="#"
                                                            onClick={() =>
                                                                setFamiliar(
                                                                    item,
                                                                    1
                                                                )
                                                            }
                                                        >
                                                            Know
                                                        </a>
                                                    </li>
                                                    <li>
                                                        <a
                                                            class="dropdown-item"
                                                            href="#"
                                                            onClick={() =>
                                                                setFamiliar(
                                                                    item,
                                                                    2
                                                                )
                                                            }
                                                        >
                                                            Know Well
                                                        </a>
                                                    </li>
                                                    <li>
                                                        <hr class="dropdown-divider"></hr>
                                                    </li>
                                                    <li>
                                                        <a
                                                            class="dropdown-item"
                                                            href="#"
                                                            onClick={() =>
                                                                deleteWord(item)
                                                            }
                                                        >
                                                            Delete
                                                        </a>
                                                    </li>
                                                </ul>
                                            </div>
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
            </BackPage>
            <PopupWord word={word()} setWord={setWord}></PopupWord>
        </>
    );
};

export default Words;
