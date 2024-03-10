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
import { setAppConfig } from './state';
import { event } from '@tauri-apps/api';

render(
    () => (
        <Router root={App}>
            <Route path="/" component={Home} />
            <Route path="/settings" component={Settings} />
        </Router>
    ),
    document.getElementById('root')!
);

event.listen<Configuration>('settings_changed', ({ payload }) => {
    setAppConfig(payload);
});

sendMessage('get_settings', undefined).then((v) => {
    setAppConfig(v);
});
