import { useNavigate } from '@solidjs/router';
import { event } from '@tauri-apps/api';
import { ParentComponent } from 'solid-js';

const App: ParentComponent = (props) => {
    const navigate = useNavigate();

    event.listen('ocr_text', ({ payload }) => {
        console.log(payload);
        const kw = encodeURIComponent(payload as string);
        navigate(`/?kw=${kw}`, { replace: true });
    });

    return props.children;
};

export default App;
