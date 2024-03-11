import { tauri } from '@tauri-apps/api';
import poptip from 'poptip';

export function sendMessage<K extends keyof IpcMessage>(
    channel: K,
    req: IpcMessage[K]['req']
): Promise<IpcMessage[K]['res']> {
    return new Promise((resolve, reject) => {
        tauri
            .invoke<IpcMessage[K]['res']>(channel, {
                req,
            })
            .then((res) => {
                console.log('IPC', channel, req, res);
                resolve(res);
            })
            .catch((e) => {
                console.log('IPC', channel, req, e);
                poptip.error(`${e}`);
                reject(e);
            });
    });
}

export function debounce<T extends (...args: any[]) => any>(
    f: T,
    delay: number
) {
    let timer: number | null = null;

    return (...args: Parameters<T>) => {
        if (timer) {
            clearTimeout(timer);
        }
        timer = window.setTimeout(() => {
            timer = null;
            f(...args);
        }, delay);
    };
}

export function numbers2Uint8Array(arr: number[]): Uint8Array {
    const r = new Uint8Array(arr.length);
    arr.forEach((n, i) => (r[i] = n));
    return r;
}

export function getIDGenerator() {
    let id = 0;
    return () => {
        if (id === Number.MAX_SAFE_INTEGER) {
            id = 0;
        } else {
            id++;
        }
        return id;
    };
}
