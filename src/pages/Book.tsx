import { Component, createSignal, For, onMount, Show } from 'solid-js';
import BackPage from '../components/BackPage';
import { createStore, produce } from 'solid-js/store';
import { sendMessage } from '../base';
import style from './Book.module.css';
import { Portal } from 'solid-js/web';
import Modal from 'bootstrap/js/dist/modal';
import poptip from 'poptip';
import { A } from '@solidjs/router';
import { open, confirm } from '@tauri-apps/plugin-dialog';

const codeFormat = JSON.stringify(
    [{ name: 'Book Name', words: ['hello', 'world'] }],
    null,
    4
);

const Book: Component = () => {
    const [books, setBooks] = createStore<BookModel[]>([]);
    const [editBook, setEditBook] = createSignal<BookModel | null>(null);
    let nameEl!: HTMLInputElement;
    let editModal: Modal;
    let importModal: Modal;
    const [savingBook, setSavingBook] = createSignal(false);

    async function getBookList() {
        const list = await sendMessage('get_book_list', undefined);
        setBooks(list);
    }

    async function saveBook() {
        const name = nameEl.value.trim();
        if (name.length === 0) {
            poptip.error('Invalid book name, please check it');
            return;
        }
        setSavingBook(true);
        try {
            const book = editBook();
            if (book) {
                await sendMessage('update_book', { id: book.id, name });
                const idx = books.indexOf(book);
                setBooks(
                    produce((s) => {
                        s[idx].name = name;
                    })
                );
            } else {
                const r = await sendMessage('add_book', name);
                setBooks(produce((s) => s.push(r)));
            }
        } catch (e) {
            poptip.error(`Fail to save book.\n${e}`);
        }
        setSavingBook(false);
        editModal.hide();
    }

    const right: Component = () => {
        function openAddModal() {
            setEditBook(null);
            editModal.show();
        }

        return (
            <div class="dropdown">
                <button
                    type="button"
                    class="btn btn-light"
                    data-bs-toggle="dropdown"
                    aria-expanded="false"
                >
                    <i class="bi bi-plus-circle"></i>
                </button>
                <ul class="dropdown-menu">
                    <li>
                        <a
                            class="dropdown-item"
                            href="#"
                            onClick={openAddModal}
                        >
                            Add
                        </a>
                    </li>
                    <li>
                        <a
                            class="dropdown-item"
                            href="#"
                            onClick={() => {
                                importModal.show();
                            }}
                        >
                            Import
                        </a>
                    </li>
                </ul>
            </div>
        );
    };

    function openEditModal(data: BookModel) {
        setEditBook(data);
        editModal.show();
    }

    async function selectFile() {
        const file = await open({
            multiple: false,
            filters: [{ name: 'JSON', extensions: ['json'] }],
            directory: false,
        });
        if (file === null) {
            return;
        }
        importModal.hide();
        sendMessage('import_book', file)
            .then(() => {
                poptip.info('Import successfully');
                getBookList();
            })
            .catch((e) => {
                poptip.error(`fail to import.\n${e}`);
            });
    }

    async function deleteBook(item: BookModel) {
        if (await confirm(`Delete ${item.name}?`)) {
            try {
                await sendMessage('delete_book', [item.id]);
                const idx = books.indexOf(item);
                setBooks(produce((s) => s.splice(idx, 1)));
            } catch (e) {
                poptip.error(`fail to delete ${item.name}.\n${e}`);
            }
        }
    }

    onMount(() => {
        getBookList();
        editModal = Modal.getOrCreateInstance(
            document.getElementById('edit-book-name-modal')!
        );
        importModal = Modal.getOrCreateInstance(
            document.getElementById('import-modal')!
        );
    });

    return (
        <BackPage title="Books" right={right}>
            <div class="responsive-wrapper">
                <For each={books}>
                    {(item) => (
                        <A class={style.book} href={'/book/' + item.id}>
                            <h5>{item.name}</h5>
                            <Show when={item.id !== 0}>
                                <div class="dropdown">
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
                                                    openEditModal(item)
                                                }
                                            >
                                                Rename
                                            </a>
                                        </li>
                                        <li>
                                            <hr class="dropdown-divider"></hr>
                                        </li>
                                        <li>
                                            <a
                                                class="dropdown-item"
                                                href="#"
                                                onClick={() => deleteBook(item)}
                                            >
                                                Delete
                                            </a>
                                        </li>
                                    </ul>
                                </div>
                            </Show>
                        </A>
                    )}
                </For>
            </div>
            <Portal>
                <div
                    class="modal fade"
                    id="edit-book-name-modal"
                    tabindex="-1"
                    aria-hidden="true"
                >
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h1 class="modal-title fs-5">
                                    {editBook()?.name ?? 'Add Book'}
                                </h1>
                                <button
                                    type="button"
                                    class="btn-close"
                                    data-bs-dismiss="modal"
                                    aria-label="Close"
                                ></button>
                            </div>
                            <div class="modal-body">
                                <div class="mb-3">
                                    <label for="book-name" class="form-label">
                                        Name
                                    </label>
                                    <input
                                        type="text"
                                        class="form-control"
                                        id="book-name"
                                        ref={nameEl}
                                        value={editBook()?.name ?? ''}
                                    />
                                </div>
                            </div>
                            <div class="modal-footer">
                                <button
                                    type="button"
                                    class="btn btn-primary w-100"
                                    disabled={savingBook()}
                                    onClick={saveBook}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </Portal>
            <Portal>
                <div
                    class="modal fade"
                    id="import-modal"
                    tabindex="-1"
                    aria-hidden="true"
                >
                    <div class="modal-dialog">
                        <div class="modal-content">
                            <div class="modal-header">
                                <h1 class="modal-title fs-5">
                                    Import from file
                                </h1>
                                <button
                                    type="button"
                                    class="btn-close"
                                    data-bs-dismiss="modal"
                                    aria-label="Close"
                                ></button>
                            </div>
                            <div class="modal-body">
                                <pre>
                                    <code>{codeFormat}</code>
                                </pre>
                            </div>
                            <div class="modal-footer">
                                <button
                                    type="button"
                                    class="btn btn-primary w-100"
                                    onClick={selectFile}
                                >
                                    Select
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </Portal>
        </BackPage>
    );
};

export default Book;
