import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import { resolve } from 'path';

export default defineConfig({
    server: {
        port: 3100,
    },
    plugins: [solid()],
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                definition: resolve(__dirname, 'definition/index.html'),
            },
        },
    },
});
