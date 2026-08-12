# electron-ipc-socket

Typed, bidirectional RPC and events over a dedicated Electron `MessagePort`.

[![npm version](https://badge.fury.io/js/electron-ipc-socket.svg)](https://www.npmjs.com/package/electron-ipc-socket)
[![Node CI](https://github.com/ziflex/electron-ipc-socket/actions/workflows/nodejs.yml/badge.svg)](https://github.com/ziflex/electron-ipc-socket/actions/workflows/nodejs.yml)

Version 4 is a dual ESM/CommonJS redesign for Node.js 22.12 or newer and Electron 41, 42, or 43. It replaces the v3 `Socket` and `Transport` API with secure sessions built on `MessageChannelMain`.

```sh
npm install electron-ipc-socket
```

## Define a contract

A contract describes what each side receives. `main.requests` and `main.events` are handled by the main process; `renderer.requests` and `renderer.events` are handled by the renderer.

```ts
// contract.ts
import type { Procedure } from 'electron-ipc-socket';

export type AppContract = {
    main: {
        requests: {
            readPreferences: Procedure<void, { theme: 'light' | 'dark' }>;
            savePreferences: Procedure<{ theme: 'light' | 'dark' }, void>;
        };
        events: {
            rendererReady: void;
        };
    };
    renderer: {
        requests: {
            confirm: Procedure<{ message: string }, boolean>;
        };
        events: {
            preferencesChanged: { theme: 'light' | 'dark' };
        };
    };
};
```

The type contract rejects non-`Procedure` request entries and non-string route keys, but types alone do not inspect runtime IPC data. Payloads and results must also be supported by the structured clone algorithm; functions, promises, symbols, and Electron objects cannot be sent.

## Optional runtime validation

For untrusted payloads, provide a complete [Standard Schema V1](https://standardschema.dev/schema) validation tree. The package accepts schemas from Standard Schema-compatible libraries without depending on one. Every request needs input and output schemas, and every event needs a payload schema on both sides:

```ts
// validation.ts
import { defineContractValidation } from 'electron-ipc-socket';
import type { AppContract } from './contract.js';
import { schemas } from './schemas.js';

export const validation = defineContractValidation<AppContract>({
    main: {
        requests: {
            readPreferences: {
                input: schemas.void,
                output: schemas.preferences,
            },
            savePreferences: {
                input: schemas.preferences,
                output: schemas.void,
            },
        },
        events: { rendererReady: schemas.void },
    },
    renderer: {
        requests: {
            confirm: {
                input: schemas.confirmation,
                output: schemas.boolean,
            },
        },
        events: { preferencesChanged: schemas.preferences },
    },
});
```

`schemas` may contain synchronous or asynchronous Standard Schema V1 validators. Validation occurs only when data is received, and the parsed schema value is passed to the handler, listener, or caller. Pass the same definition to both sessions for validation in both directions; it is never sent through preload or IPC.

## Main process

Create one session for each `(WebContents, channel)` pair. Authorization is mandatory and synchronous. The library also verifies that the handshake came from that exact live `WebContents`, its current main frame, and the URL and origin observed during authorization.

```ts
// main.ts
import { BrowserWindow } from 'electron';
import { createMainSession } from 'electron-ipc-socket/main';
import type { AppContract } from './contract.js';
import { validation } from './validation.js';

const window = new BrowserWindow({
    webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: '/absolute/path/to/preload.cjs',
        sandbox: true,
    },
});

const session = createMainSession<AppContract>({
    channel: 'application',
    webContents: window.webContents,
    authorize: ({ origin, url }) =>
        origin === 'app://local' && url === 'app://local/index.html',
    validation,
});

session.handle('readPreferences', () => ({ theme: 'dark' }));
session.handle('savePreferences', (payload, context) => {
    // payload is the parsed savePreferences input.
    context.signal.throwIfAborted();
});

session.on('rendererReady', () => {
    session.send('preferencesChanged', { theme: 'dark' });
});

await session.ready;
const accepted = await session.invoke('confirm', {
    message: 'Continue?',
});
```

Handlers registered on a main session survive renderer reloads. A disconnect rejects pending calls and aborts active handler contexts; a subsequent authorized handshake reconnects the same session. Events sent while disconnected throw immediately and are not queued or replayed.

## Preload bridge

The preload owns the handshake. It exposes only a small bridge for the dedicated port and never exposes `ipcRenderer`.

```ts
// preload.ts
import { exposeBridge } from 'electron-ipc-socket/preload';

exposeBridge({
    channel: 'application',
    key: 'applicationIpc',
});
```

The package publishes a CommonJS preload export, but [Electron's sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox) exposes only a restricted `require` that cannot load arbitrary package modules, and [sandboxed preloads cannot use ESM](https://www.electronjs.org/docs/latest/tutorial/esm). A sandboxed application must therefore bundle its preload even when the source uses CommonJS:

```ts
// preload.cts
import preload = require('electron-ipc-socket/preload');

preload.exposeBridge({
    channel: 'application',
    key: 'applicationIpc',
});
```

Bundle it to one CommonJS file and leave Electron external:

```sh
esbuild src/preload.cts \
    --bundle \
    --platform=node \
    --format=cjs \
    --external:electron \
    --outfile=dist/preload.cjs
```

Point `webPreferences.preload` at the resulting absolute `preload.cjs` path. Keep `sandbox: true`, `contextIsolation: true`, and `nodeIntegration: false`.

## Renderer

The renderer wrapper owns RPC handlers, `AbortSignal` objects, and reconstructed errors in the renderer world rather than in preload.

```ts
// renderer.ts
import type { PreloadBridge } from 'electron-ipc-socket';
import { RemoteError } from 'electron-ipc-socket';
import { createRendererSession } from 'electron-ipc-socket/renderer';
import type { AppContract } from './contract.js';
import { validation } from './validation.js';

declare global {
    interface Window {
        applicationIpc: PreloadBridge;
    }
}

const session = createRendererSession<AppContract>(window.applicationIpc, {
    validation,
});

session.handle('confirm', ({ message }) => window.confirm(message));
await session.ready;
session.send('rendererReady');

try {
    const preferences = await session.invoke('readPreferences');
    console.log(preferences.theme);
} catch (error) {
    if (error instanceof RemoteError) {
        console.error(error.remoteName, error.code, error.message);
    }
}
```

## Session API

Both main and renderer sessions provide the same directional API:

| Member                              | Purpose                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------- |
| `ready`                             | Promise for the current or next connection.                                           |
| `isConnected`                       | Whether a dedicated port is currently attached.                                       |
| `invoke(route, payload?, options?)` | Call a request handled by the other side.                                             |
| `handle(route, handler)`            | Register one local request handler; returns an unsubscribe function.                  |
| `send(event, payload?)`             | Send a one-way event to the other side.                                               |
| `on(event, listener)`               | Subscribe to a local event; returns an unsubscribe function.                          |
| `once(event, listener)`             | Subscribe for one event; returns an unsubscribe function.                             |
| `onStateChange(listener)`           | Observe connection state; immediately receives the current state.                     |
| `onError(listener)`                 | Observe malformed messages and transport errors.                                      |
| `dispose()`                         | Close the session and deterministically clear handlers, calls, timers, and listeners. |

The default invocation timeout is 60 seconds. Override it for one call, disable it with `false`, and/or attach a cancellation signal:

```ts
const controller = new AbortController();

const result = session.invoke('readPreferences', undefined, {
    signal: controller.signal,
    timeout: 5_000,
});

controller.abort();
await result;
```

Cancellation aborts the remote handler's `context.signal`. Late replies are ignored, and every timeout and signal listener is removed when a call settles.

Handlers may throw `RpcError` to expose a stable error code:

```ts
import { RpcError } from 'electron-ipc-socket';

throw new RpcError('ERR_NOT_ALLOWED', 'This operation is not allowed');
```

Callers receive `RemoteError` containing `remoteName`, `message`, and `code`. Remote stack traces are never transmitted. Other thrown values are reduced to a safe name and message.

Failed request validation is reported locally through `onError` and returned to the caller as a sanitized `RemoteError` with code `ERR_IPC_VALIDATION`. Failed result validation rejects the local invocation with `ValidationError`. Failed event validation reports `ValidationError` through `onError`, drops the event, and does not consume a `once` listener. Standard Schema issue details remain in the receiving process and are never transmitted.

## Module formats

Every entry point supports ESM `import` and CommonJS `require` through conditional exports:

```js
// ESM
import { RpcError } from 'electron-ipc-socket';
import { createMainSession } from 'electron-ipc-socket/main';
```

```js
// CommonJS
const { RpcError } = require('electron-ipc-socket');
const { createMainSession } = require('electron-ipc-socket/main');
```

The root package remains `"type": "module"`; `require` resolves to the separate CommonJS build. Both builds share public error branding and main-session channel ownership when they are loaded in the same process.

## Migrate from v3

Version 4 intentionally has no v3 compatibility entry point.

| v3                                    | v4                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `new Socket(new Transport(...))`      | `createMainSession`, bundled `exposeBridge`, and `createRendererSession`                          |
| `socket.open(channel)`                | Pass the same `channel` to `createMainSession` and `exposeBridge`; await `session.ready`          |
| `socket.request(name, data)`          | `session.invoke(name, data)`                                                                      |
| `socket.onRequest(name, handler)`     | `session.handle(name, handler)`; payload and cancellation context are separate arguments          |
| `socket.send(name, data)`             | `session.send(name, data)`                                                                        |
| `socket.onEvent(name, handler)`       | `session.on(name, handler)` or `session.once(name, handler)`                                      |
| `Settings.timeout`                    | `defaultTimeout` on session creation or `timeout` per invocation                                  |
| `Settings.cleanup`                    | Removed; v4 cleans each timer and listener deterministically and has no polling interval          |
| `socket.close()` / `socket.dispose()` | `session.dispose()`; main sessions reconnect automatically across renderer reloads until disposed |

Consumers that cannot migrate must remain on v3.

## Compatibility

- Node.js `>=22.12.0`
- Electron `>=41 <44`
- ESM and CommonJS application code
- Bundled CommonJS sandbox preload

The release test matrix covers Electron 41.10.5, 42.9.0, and 43.4.0. Delivery is ordered and at most once while connected; there is no persistence or event replay.
