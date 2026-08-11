# electron-ipc-socket

Typed, bidirectional RPC and events over a dedicated Electron `MessagePort`.

[![npm version](https://badge.fury.io/js/electron-ipc-socket.svg)](https://www.npmjs.com/package/electron-ipc-socket)
[![Node CI](https://github.com/ziflex/electron-ipc-socket/actions/workflows/nodejs.yml/badge.svg)](https://github.com/ziflex/electron-ipc-socket/actions/workflows/nodejs.yml)

Version 4 is an ESM-only redesign for Node.js 22.12 or newer and Electron 41, 42, or 43. It replaces the v3 `Socket` and `Transport` API with secure sessions built on `MessageChannelMain`.

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

The contract exists only at compile time. IPC input is untrusted data: handlers must perform runtime validation before using a payload. Payloads and results must also be supported by the structured clone algorithm; functions, promises, symbols, and Electron objects cannot be sent.

## Main process

Create one session for each `(WebContents, channel)` pair. Authorization is mandatory and synchronous. The library also verifies that the handshake came from that exact live `WebContents`, its current main frame, and the URL and origin observed during authorization.

```ts
// main.ts
import { BrowserWindow } from 'electron';
import { createMainSession } from 'electron-ipc-socket/main';
import type { AppContract } from './contract.js';

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
});

session.handle('readPreferences', () => ({ theme: 'dark' }));
session.handle('savePreferences', (payload, context) => {
    // Validate payload before writing it.
    if (payload?.theme !== 'light' && payload?.theme !== 'dark') {
        throw new TypeError('Invalid theme');
    }

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

This package publishes ESM only, but sandboxed Electron preloads cannot load ESM directly. Bundle the preload to CommonJS and leave Electron external:

```sh
esbuild src/preload.ts \
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

declare global {
    interface Window {
        applicationIpc: PreloadBridge;
    }
}

const session = createRendererSession<AppContract>(window.applicationIpc);

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
- ESM application and renderer code
- Bundled CommonJS sandbox preload

The release test matrix covers Electron 41.10.5, 42.9.0, and 43.4.0. Delivery is ordered and at most once while connected; there is no persistence or event replay.
