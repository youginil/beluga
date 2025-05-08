import { networkInterfaces } from 'os';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

function getLocalIP() {
    const interfaces = networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return 'localhost';
}

export default defineConfig({
    server: {
        host: '0.0.0.0',
        port: 3100,
        hmr: {
            host: getLocalIP(),
        },
    },
    plugins: [solid()],
});
