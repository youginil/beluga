import { Component, For } from 'solid-js';
import { appConfig, setAppConfig } from '../state';
import { sendMessage } from '../base';
import poptip from 'poptip';
import BackPage from '../components/BackPage';
import * as dialog from '@tauri-apps/plugin-dialog';
import * as shell from '@tauri-apps/plugin-shell';

const Settings: Component = () => {
    async function openDictDir() {
        await shell.open(appConfig.dict_dir);
    }
    async function chooseDictDir() {
        const dir = await dialog.open({ directory: true, multiple: false });
        if (typeof dir !== 'string') {
            return;
        }
        await sendMessage('set_settings', { dict_dir: dir });
    }

    async function toggleDictAvailable(index: number) {
        const item = appConfig.dicts[index];
        setAppConfig('dicts', index, 'available', !item.available);
        await sendMessage('set_settings', { dicts: appConfig.dicts });
        poptip.info('Settings saved');
    }

    async function sortDicts(i: number, up: boolean) {
        const dicts = appConfig.dicts;
        let dl: DictItem[] = [];
        if (up) {
            dl = [
                ...dicts.slice(0, i - 1),
                dicts[i],
                dicts[i - 1],
                ...dicts.slice(i + 1),
            ];
        } else {
            dl = [
                ...dicts.slice(0, i),
                dicts[i + 1],
                dicts[i],
                ...dicts.slice(i + 2),
            ];
        }
        await sendMessage('set_settings', { dicts: dl });
        poptip.info('Settings saved');
    }

    async function changePrefixNumber(n: number) {
        if (Number.isNaN(n)) {
            n = 5;
        }
        n = Math.ceil(n);
        if (n < 1) {
            n = 1;
        }
        await sendMessage('set_settings', { prefix_limit: n });
        poptip.info('Settings saved');
    }

    async function changePhraseNumber(n: number) {
        if (Number.isNaN(n)) {
            n = 10;
        }
        n = Math.ceil(n);
        if (n < 0) {
            n = 0;
        }
        await sendMessage('set_settings', { phrase_limit: n });
        poptip.info('Settings saved');
    }

    async function changeCacheSize(size: number) {
        if (Number.isNaN(size)) {
            size = 100;
        }
        if (size <= 0) {
            return poptip.error('invalid cache size');
        }
        await sendMessage('set_settings', { cache_size: size });
        poptip.info('Settings saved');
    }

    async function toggleDevMode() {
        setAppConfig('dev_mode', !appConfig.dev_mode);
        await sendMessage('set_settings', { dev_mode: appConfig.dev_mode });
        poptip.info('Settings saved');
    }

    return (
        <BackPage title="Settings">
            <div class="responsive-wrapper">
                <div>
                    <h6 class="form-label">Dictionary Directory</h6>
                    <div class="input-group mb-3">
                        <input
                            type="text"
                            class="form-control"
                            value={appConfig.dict_dir}
                            readOnly
                        />
                        <button
                            class="btn btn-outline-secondary"
                            onClick={openDictDir}
                        >
                            Open
                        </button>
                        <button
                            class="btn btn-outline-secondary"
                            onClick={chooseDictDir}
                        >
                            Choose
                        </button>
                    </div>
                </div>
                <div class="mt-3">
                    <h6 class="form-label">Dictionaries</h6>
                    <ul class="list-group">
                        <For each={appConfig.dicts}>
                            {(item, index) => (
                                <li class="list-group-item d-flex justify-content-between align-items-center">
                                    <div>
                                        <input
                                            id={'dict-' + item.id}
                                            class="form-check-input me-1"
                                            type="checkbox"
                                            checked={item.available}
                                            onChange={() =>
                                                toggleDictAvailable(index())
                                            }
                                        />
                                        <label
                                            class="form-check-label"
                                            for={'dict-' + item.id}
                                        >
                                            {item.name}
                                        </label>
                                    </div>
                                    <div class="flex-shrink-0">
                                        <button
                                            class="btn btn-sm btn-light"
                                            onClick={() =>
                                                sortDicts(index(), true)
                                            }
                                            disabled={index() === 0}
                                        >
                                            <i class="bi bi-arrow-up"></i>
                                        </button>
                                        <button
                                            class="btn btn-sm btn-light ms-2"
                                            onClick={() =>
                                                sortDicts(index(), false)
                                            }
                                            disabled={
                                                index() ===
                                                appConfig.dicts.length - 1
                                            }
                                        >
                                            <i class="bi bi-arrow-down"></i>
                                        </button>
                                    </div>
                                </li>
                            )}
                        </For>
                    </ul>
                </div>
                <div class="mt-3">
                    <h6 class="form-label">Result</h6>
                    <div class="input-group mb-3">
                        <span class="input-group-text">
                            Result for prefix-matched
                        </span>
                        <input
                            type="number"
                            class="form-control"
                            value={appConfig.prefix_limit}
                            onChange={(e) => {
                                changePrefixNumber(+e.target.value);
                            }}
                        />
                    </div>
                    <div class="input-group mb-3">
                        <span class="input-group-text">
                            Result for phrase-matched
                        </span>
                        <input
                            type="number"
                            class="form-control"
                            value={appConfig.phrase_limit}
                            onChange={(e) => {
                                changePhraseNumber(+e.target.value);
                            }}
                        />
                    </div>
                </div>
                <div class="mt-3">
                    <h6 class="form-label">Node Cache</h6>
                    <div class="input-group">
                        <input
                            type="number"
                            class="form-control"
                            value={appConfig.cache_size}
                            onChange={(e) => changeCacheSize(+e.target.value)}
                        />
                        <span class="input-group-text">M</span>
                    </div>
                </div>
                <div class="mt-3">
                    <h6 class="form-label">Developer</h6>
                    <p>
                        <kbd>Shift</kbd> + <kbd>Alt</kbd> + <kbd>D</kbd> Open
                        Developer Tools
                    </p>
                    <span class="fst-italic fw-lighter">
                        Developer Mode: disable static file cache in your
                        dictionary directory
                    </span>
                    <div class="form-check">
                        <input
                            class="form-check-input"
                            type="checkbox"
                            checked={appConfig.dev_mode}
                            id="dev-mode"
                            onChange={toggleDevMode}
                        />
                        <label class="form-check-label" for="dev-mode">
                            Active Developer Mode
                        </label>
                    </div>
                </div>
            </div>
        </BackPage>
    );
};

export default Settings;
