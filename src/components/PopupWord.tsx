import { For, ParentComponent, Setter, createEffect } from 'solid-js';
import './PopupWord.css';
import { loadEntry, makeSearcher } from '../base';

interface PopupWordProps {
    word: string | null;
    setWord: Setter<string | null>;
}

const PopupWord: ParentComponent<PopupWordProps> = (props) => {
    let wrapperEl!: HTMLDivElement;
    let iframe!: HTMLIFrameElement;

    const { search, selectedWord, setSelectedWord, searchResult } =
        makeSearcher(true, 1, 0);

    createEffect(() => {
        const wd = selectedWord();
        if (wd) {
            loadEntry(iframe, wd.id, wd.name);
        } else {
            iframe.src = '';
        }
    });

    function afterTransition(e: TransitionEvent) {
        if (e.target === wrapperEl) {
            setSelectedWord(null);
            props.setWord(null);
            wrapperEl.removeEventListener('transitionend', afterTransition);
            wrapperEl.style.display = 'none';
        }
    }

    createEffect(() => {
        const wd = props.word;
        if (wd) {
            wrapperEl.style.display = 'block';
            setTimeout(() => {
                wrapperEl.classList.add('show');
                search(wd);
            }, 0);
        }
    });

    let dictListEl!: HTMLDivElement;
    function onDictListScroll(e: WheelEvent) {
        if (e.deltaX === 0 && e.deltaY !== 0) {
            e.preventDefault();
            e.stopPropagation();
            dictListEl.scrollBy({ left: e.deltaY });
        }
    }

    function close() {
        wrapperEl.addEventListener('transitionend', afterTransition);
        wrapperEl.classList.remove('show');
    }

    return (
        <div class="popup-word-wrapper" ref={wrapperEl!}>
            <div class="popup-word d-flex flex-column">
                <div class="flex-shrink-0 d-flex align-items-center p-2">
                    <h4 class="mb-0 flex-grow-1 me-2 d-flex align-items-center justify-content-center">
                        {props.word ?? ''}
                    </h4>
                    <button class="btn btn-light" onClick={close}>
                        <i class="bi bi-x-lg"></i>
                    </button>
                </div>
                <div
                    class="flex-shrink-0 px-2 overflow-hidden"
                    style="height: 40px"
                >
                    <div
                        class="dict-list"
                        ref={dictListEl}
                        onWheel={onDictListScroll}
                    >
                        <For each={searchResult.exact}>
                            {(item) => (
                                <span
                                    class="dict-name"
                                    classList={{
                                        active: item.id === selectedWord()?.id,
                                    }}
                                    onClick={() => {
                                        setSelectedWord(item);
                                    }}
                                >
                                    {item.dict}
                                </span>
                            )}
                        </For>
                    </div>
                </div>
                <div class="flex-grow-1 pt-2">
                    <iframe src="" ref={iframe!}></iframe>
                </div>
            </div>
        </div>
    );
};

export default PopupWord;
