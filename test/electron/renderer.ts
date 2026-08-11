import type { PreloadBridge, Procedure } from '../../dist/index.js';
import { AbortError, RemoteError } from '../../dist/index.js';
import { createRendererSession } from '../../dist/renderer.js';

type FixtureContract = {
    main: {
        requests: {
            'fixture:add': Procedure<{ left: number; right: number }, number>;
            'fixture:cancel': Procedure<{ run: number }, void>;
            'fixture:cancel-seen': Procedure<{ run: number }, boolean>;
            'fixture:fail': Procedure<void, void>;
            'fixture:ready': Procedure<{ run: number }, void>;
            'fixture:report': Procedure<RendererReport, void>;
        };
        events: {
            'fixture:renderer-event': { run: number };
        };
    };
    renderer: {
        requests: {
            'fixture:cancel-renderer': Procedure<{ run: number }, void>;
            'fixture:uppercase': Procedure<string, string>;
        };
        events: {
            'fixture:main-event': { run: number };
        };
    };
};

interface RendererReport {
    addResult: number;
    cancellationObserved: boolean;
    errorCode: string;
    eventCount: number;
    ok: boolean;
    run: number;
}

declare global {
    interface Window {
        fixtureBridge: PreloadBridge;
    }
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function eventually(check: () => Promise<boolean>): Promise<boolean> {
    for (let attempt = 0; attempt < 50; attempt++) {
        if (await check()) {
            return true;
        }
        await delay(10);
    }
    return false;
}

const navigation = performance.getEntriesByType(
    'navigation',
)[0] as PerformanceNavigationTiming;
const run = navigation.type === 'reload' ? 2 : 1;
const session = createRendererSession<FixtureContract>(window.fixtureBridge, {
    defaultTimeout: 2_000,
});
let rendererCancellationObserved = false;
let eventCount = 0;
let unsubscribeEvent: () => void = () => undefined;

session.handle('fixture:uppercase', (value) => value.toUpperCase());
session.handle('fixture:cancel-renderer', (_payload, context) => {
    return new Promise<void>((resolve) => {
        context.signal.addEventListener(
            'abort',
            () => {
                rendererCancellationObserved = true;
                resolve();
            },
            { once: true },
        );
    });
});
unsubscribeEvent = session.on('fixture:main-event', (payload) => {
    if (payload.run === run) {
        eventCount++;
        unsubscribeEvent();
    }
});

async function runFixture(): Promise<void> {
    try {
        await session.ready;
        await session.invoke('fixture:ready', { run });

        const addResult = await session.invoke('fixture:add', {
            left: run,
            right: 40,
        });

        let errorCode = '';
        try {
            await session.invoke('fixture:fail');
        } catch (error) {
            if (error instanceof RemoteError) {
                errorCode = error.code;
            }
        }

        const controller = new AbortController();
        const cancellation = session.invoke(
            'fixture:cancel',
            { run },
            { signal: controller.signal },
        );
        setTimeout(() => controller.abort(), 10);
        try {
            await cancellation;
        } catch (error) {
            if (!(error instanceof AbortError)) {
                throw error;
            }
        }
        const cancellationObserved = await eventually(() =>
            session.invoke('fixture:cancel-seen', { run }),
        );

        session.send('fixture:renderer-event', { run });
        session.send('fixture:renderer-event', { run });
        await eventually(async () => {
            await delay(0);
            return rendererCancellationObserved && eventCount === 1;
        });

        await session.invoke('fixture:report', {
            addResult,
            cancellationObserved,
            errorCode,
            eventCount,
            ok:
                addResult === run + 40 &&
                cancellationObserved &&
                errorCode === 'ERR_FIXTURE' &&
                eventCount === 1 &&
                rendererCancellationObserved,
            run,
        });
    } catch (error) {
        await session.invoke('fixture:report', {
            addResult: -1,
            cancellationObserved: false,
            errorCode: error instanceof Error ? error.message : String(error),
            eventCount,
            ok: false,
            run,
        });
    }
}

void runFixture();
