import type { PreloadBridge } from 'electron-ipc-socket';
import { AbortError, RemoteError, ValidationError } from 'electron-ipc-socket';
import { createRendererSession } from 'electron-ipc-socket/renderer';

import { type FixtureContract, validation } from './contract.js';

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
    validation,
});
let rendererCancellationObserved = false;
let eventCount = 0;
let invalidEventCount = 0;
const validationErrors: ValidationError[] = [];
let unsubscribeEvent: () => void = () => undefined;

session.handle('fixture:uppercase', (value) => value.toUpperCase());
session.handle(
    'fixture:invalid-result',
    () => 'invalid result' as unknown as number,
);
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
session.on('fixture:invalid-event', () => {
    invalidEventCount++;
});
session.onError((error) => {
    if (error instanceof ValidationError) {
        validationErrors.push(error);
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
        const validatedValue = await session.invoke('fixture:validate', {
            value: ' validated ',
        });

        let invalidRequestCode = '';
        try {
            await session.invoke('fixture:add', {
                left: 'invalid' as unknown as number,
                right: 40,
            });
        } catch (error) {
            if (error instanceof RemoteError) {
                invalidRequestCode = error.code;
            }
        }

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
            invalidEventCount,
            invalidRequestCode,
            ok:
                addResult === run + 40 &&
                cancellationObserved &&
                errorCode === 'ERR_FIXTURE' &&
                eventCount === 1 &&
                invalidEventCount === 0 &&
                invalidRequestCode === 'ERR_IPC_VALIDATION' &&
                rendererCancellationObserved &&
                validatedValue === 'validated' &&
                validationErrors.length >= 1,
            run,
            validatedValue,
            validationErrorCount: validationErrors.length,
        });
    } catch (error) {
        await session.invoke('fixture:report', {
            addResult: -1,
            cancellationObserved: false,
            errorCode: error instanceof Error ? error.message : String(error),
            eventCount,
            invalidEventCount,
            invalidRequestCode: '',
            ok: false,
            run,
            validatedValue: '',
            validationErrorCount: validationErrors.length,
        });
    }
}

void runFixture();
