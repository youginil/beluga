import { A } from '@solidjs/router';
import { Component, For } from 'solid-js';
import './Settings.css';
import { appConfig, setAppConfig } from '../state';
import { dialog, shell } from '@tauri-apps/api';
import { sendMessage } from '../base';
import poptip from 'poptip';

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

    async function changeCacheSize(size: number) {
        if (size <= 0) {
            return poptip.error('invalid cache size');
        }
        await sendMessage('set_settings', { cache_size: size });
        poptip.info('Settings saved');
    }

    return (
        <div class="d-flex flex-column">
            <header class="flex-shrink-0 p-2 bg-light-subtle">
                <A href="/" class="btn btn-light" end={true}>
                    <i class="bi bi-arrow-left"></i>
                </A>
            </header>
            <div class="flex-grow-1 overflow-y-auto">
                <div class="settings-wrapper">
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
                                    <li class="list-group-item">
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
                                    </li>
                                )}
                            </For>
                        </ul>
                    </div>
                    <div class="mt-3">
                        <h6 class="form-label">Cache</h6>
                        <div class="input-group">
                            <input
                                type="number"
                                class="form-control"
                                value={appConfig.cache_size}
                                onChange={(e) =>
                                    changeCacheSize(+e.target.value)
                                }
                            />
                            <span class="input-group-text">M</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Settings;
