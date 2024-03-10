import Sizzle from 'sizzle';

function delegate<K extends keyof DocumentEventMap>(
    elem: Element,
    type: K,
    selector: string,
    listener: (el: HTMLElement, e: DocumentEventMap[K]) => void
) {
    elem.addEventListener(type, (e) => {
        const els = e.composedPath();
        for (let i = 0; i < els.length; i++) {
            const el = els[i];
            if (Sizzle.matchesSelector(el as HTMLElement, selector)) {
                listener(el as HTMLElement, e as DocumentEventMap[K]);
            } else if (el === elem) {
                break;
            }
        }
    });
}

const ExtMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    svg: 'image/svg+xml',
    gif: 'image/gif',
    bmp: 'image/bmp',
    webp: 'image/webp',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
};

function getType(file: string): string {
    const matched = file.match(/.*\.([^\.]+)$/);
    const ext = matched ? matched[1].toLowerCase() : '';
    return ExtMap[ext] || 'application/octet-stream';
}

function postMessage(message: ChildMessage) {
    window.parent.postMessage(message);
}

/**
 * Uint8Array - loaded
 * true - loading
 * false - fail
 */
const resources: {
    name: string;
    data: Uint8Array | boolean;
    cbs: ((data: Uint8Array | null) => void)[];
}[] = [];
const urlCache: Record<string, string> = {};
// @ts-ignore
window.res = resources;

function normalizeResourceName(name: string): string {
    return (
        '\\' +
        name
            .trim()
            .replace(/\//g, '\\')
            .replace(/(^\\+|\\+$)/g, '')
    );
}

function resolveResource(
    el: Element,
    defaultKey: string
): { key: string; dictfile: string | undefined } {
    // @ts-ignore
    const hooks: DictHooks = window.dictHooks || {};
    if (hooks.resolve) {
        const ret = hooks.resolve(el, defaultKey);
        if (ret) {
            return { key: ret.key, dictfile: ret.file };
        }
    }
    return { key: defaultKey, dictfile: undefined };
}

function makeResourceURL(file: string, data: Uint8Array): string {
    let url = urlCache[file];
    if (url) {
        return url;
    }
    if (/\.spx/.test(file)) {
        const list: number[] = [];
        for (let i = 0; i < data.length; i++) {
            list.push(data[i]);
        }
        // @ts-ignore
        const ogg = new Ogg(String.fromCharCode(...list), { file: true });
        ogg.demux();
        const stream = ogg.bitstream();

        // @ts-ignore
        const header = Speex.parseHeader(ogg.frames[0]);

        // @ts-ignore
        const comment = new SpeexComment(ogg.frames[1]);

        // @ts-ignore
        const st = new Speex({
            quality: 8,
            mode: header.mode,
            rate: header.rate,
        });

        const samples = st.decode(stream, ogg.segments);

        // @ts-ignore
        var waveData = PCMData.encode({
            sampleRate: header.rate,
            channelCount: header.nb_channels,
            bytesPerSample: 2,
            data: samples,
        });

        // array buffer holding audio data in wav codec
        // @ts-ignore
        var bufWav = Speex.util.str2ab(waveData);
        // convert to a blob object
        var blob = new Blob([bufWav], { type: 'audio/wav' });
        // return a "blob://" url which can be used as a href anywhere
        url = URL.createObjectURL(blob);
    } else {
        const blob = new Blob([data], {
            type: getType(file),
        });
        url = URL.createObjectURL(blob);
    }
    urlCache[file] = url;
    return url;
}

function fetchResource(
    name: string,
    dictfile?: string
): Promise<Uint8Array | null> {
    for (let i = 0; i < resources.length; i++) {
        const res = resources[i];
        if (res.name === name) {
            if (res.data === true) {
                return new Promise((resolve) => {
                    res.cbs.push(resolve);
                });
            } else if (res.data === false) {
                return Promise.resolve(null);
            }
            return Promise.resolve(res.data);
        }
    }
    return new Promise((resolve) => {
        resources.push({ name, data: true, cbs: [resolve] });
        postMessage({
            type: 'resource',
            name,
            dictfile,
        });
    });
}

// @ts-ignore
window.initPage = () => {
    document.body.querySelectorAll('img').forEach((el) => {
        let src = el.getAttribute('src') || '';
        let matched = src.match(/^file:\/\/(.*)/);
        if (matched) {
            src = matched[1];
        }
        if (src.length === 0) {
            return;
        }
        const { key, dictfile } = resolveResource(
            el,
            normalizeResourceName(src)
        );
        el.src = key;
        fetchResource(key, dictfile).then((data) => {
            if (data) {
                const value = makeResourceURL(src, data);
                el.src = value;
            }
        });
    });
};

window.addEventListener('message', (e) => {
    const data = e.data as ParentMessage;
    for (let i = 0; i < resources.length; i++) {
        if (resources[i].name === data.name) {
            resources[i].data = data.data;
            let cb;
            while ((cb = resources[i].cbs.pop())) {
                cb(data.data || null);
            }
            break;
        }
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const audio = document.createElement('audio');
    document.body.appendChild(audio);

    delegate(document.body, 'click', 'a', (el) => {
        const href = (el as HTMLAnchorElement).getAttribute('href') || '';
        let matched;
        if ((matched = href.match(/^entry:\/\/([^#]*)(#.*)?$/))) {
            // todo redirect with hash
            if (matched[1]) {
                postMessage({
                    type: 'entry',
                    name: matched[1],
                });
            }
            if (!matched[1] && matched[2]) {
                location.hash = matched[2];
            }
        } else if ((matched = href.match(/^sound:\/\/(.+)/))) {
            const name = normalizeResourceName(matched[1]);
            const { key, dictfile } = resolveResource(el, name);
            fetchResource(key, dictfile).then((data) => {
                if (data) {
                    audio.src = makeResourceURL(name, data);
                    audio.play().catch((e) => {
                        console.error('fail to play audio', e);
                    });
                }
            });
        }
    });
});
