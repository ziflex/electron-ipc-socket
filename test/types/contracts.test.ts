import type { Procedure } from '../../src/index.js';
import type { MainSession } from '../../src/main.js';
import type { RendererSession } from '../../src/renderer.js';

type Contract = {
    main: {
        requests: {
            add: Procedure<{ left: number; right: number }, number>;
            ping: Procedure<void, string>;
        };
        events: {
            changed: { value: number };
        };
    };
    renderer: {
        requests: {
            confirm: Procedure<string, boolean>;
        };
        events: {
            notice: string;
            ready: void;
        };
    };
};

declare const main: MainSession<Contract>;
declare const renderer: RendererSession<Contract>;

void main.invoke('confirm', 'continue');
void renderer.invoke('add', { left: 1, right: 2 });
void renderer.invoke('ping');
main.send('notice', 'hello');
main.send('ready');
renderer.send('changed', { value: 1 });
main.handle('add', ({ left, right }) => left + right);
renderer.handle('confirm', async (message) => message.length > 0);

// @ts-expect-error Renderer requests are not callable from the renderer.
void renderer.invoke('confirm', 'continue');
// @ts-expect-error Main requests are not callable from the main process.
void main.invoke('add', { left: 1, right: 2 });
// @ts-expect-error Unknown request route.
void renderer.invoke('missing', undefined);
// @ts-expect-error Wrong request payload.
void renderer.invoke('add', { left: '1', right: 2 });
// @ts-expect-error Missing non-void payload.
void renderer.invoke('add');
// @ts-expect-error Wrong event payload.
main.send('notice', 42);
// @ts-expect-error Wrong handler result.
main.handle('add', () => 'not a number');
// @ts-expect-error Wrong handler direction.
main.handle('confirm', () => true);
