import { render } from 'solid-js/web';
import { Router, Route } from '@solidjs/router';
import 'bootstrap-icons/font/bootstrap-icons.css';
import './main.css';

import App from './App';
import Home from './pages/Home';
import Settings from './pages/Settings';

render(
    () => (
        <Router root={App}>
            <Route path="/" component={Home} />
            <Route path="/settings" component={Settings} />
        </Router>
    ),
    document.getElementById('root')!
);
