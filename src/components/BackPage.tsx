import { A } from '@solidjs/router';
import { ParentComponent } from 'solid-js';

interface BackPageProps {
    title: string;
    url?: string;
}

const BackPage: ParentComponent<BackPageProps> = (props) => {
    return (
        <div class="d-flex flex-column position-fixed top-0 bottom-0 start-0 end-0">
            <header class="flex-shrink-0 p-2 bg-light-subtle d-flex">
                <A href={props.url ?? '/'} class="btn btn-light" end={true}>
                    <i class="bi bi-arrow-left-circle"></i>
                </A>
                <h4 class="mb-0 flex-grow-1 d-flex justify-content-center align-items-center">
                    {props.title}
                </h4>
                <button class="btn invisible" disabled>
                    <i class="bi bi-arrow-left"></i>
                </button>
            </header>
            <div class="flex-grow-1 overflow-y-auto">{props.children}</div>
        </div>
    );
};

export default BackPage;
