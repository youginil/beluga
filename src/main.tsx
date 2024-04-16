import { render } from 'solid-js/web';
import { Router, Route } from '@solidjs/router';
import 'bootstrap-icons/font/bootstrap-icons.css';
import 'bootstrap/dist/css/bootstrap.css';
import 'bootstrap/dist/js/bootstrap.esm.js';
import 'poptip/style.css';
import './main.css';

import App from './App';
import Home from './pages/Home';
import Settings from './pages/Settings';
import { sendMessage } from './base';
import { setAppConfig, setServerPort } from './state';
import { event } from '@tauri-apps/api';
import Words from './pages/Words';

render(
    () => (
        <Router root={App}>
            <Route path="/" component={Home} />
            <Route path="/settings" component={Settings} />
            <Route path="/words" component={Words}></Route>
        </Router>
    ),
    document.getElementById('root')!
);

event.listen<Configuration>('settings_changed', ({ payload }) => {
    setAppConfig(payload);
});

let openingDevtools = false;
document.addEventListener('keydown', async (e) => {
    if (!openingDevtools && e.shiftKey && e.altKey && e.code === 'KeyD') {
        openingDevtools = true;
        try {
            await sendMessage('open_devtools', undefined);
        } catch (e) {}
        openingDevtools = false;
    }
});

sendMessage('get_settings', undefined).then((v) => {
    setAppConfig(v);
});

sendMessage('get_server_port', undefined).then((port) => {
    setServerPort(port);
});
