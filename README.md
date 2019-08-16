# electron-ipc-socket

> Event based communication

Response-request abstraction on top of Electron IPC system.

[![npm version](https://badge.fury.io/js/electron-ipc-socket.svg)](https://www.npmjs.com/package/electron-ipc-socket)
[![Actions Status](https://wdp9fww0r9.execute-api.us-west-2.amazonaws.com/production/badge/ziflex/electron-ipc-socket)](https://wdp9fww0r9.execute-api.us-west-2.amazonaws.com/production/results/ziflex/electron-ipc-socket)


```sh
    npm install --save electron-ipc-socket
```

## Motivation

Events are good, but sometimes you want something more than just 'emit and forget'.
Current package provides an abstraction on top of Electron IPC system that allows you to make 'request-response' communication.

## Usage

### Events

```typescript
// main-process.js

import { ipcMain, BrowserWindow } from 'electron';
import { Socket, Transport, Event, InboundRequest } from 'electron-ipc-socket';
import fs from 'fs';

const win = new BrowserWindow();

const socket = new Socket('main-win', new Transport(ipcMain, win));

socket.open();

socket.onEvent('ready', (evt: Event) => {
    console.log('Renderer process is ready');
});
```

```typescript
// renderer-process.js

import { ipcRenderer } from 'electron';
import { Socket } from 'electron-ipc-socket';

const socket = new Socket('main-win', ipcRenderer);

socket.open();

socket.send('ready');
```

### Request-response

```typescript
// main-process.js

import { ipcMain, BrowserWindow } from 'electron';
import { Socket, Transport, Event, InboundRequest } from 'electron-ipc-socket';
import fs from 'fs';

const win = new BrowserWindow();

const socket = new Socket('main-win', new Transport(ipcMain, win));

socket.open();

socket.onRequest('ping', (req: InboundRequest) => {
    return 'pong';
});
```

```typescript
// renderer-process.js

import { ipcRenderer } from 'electron';
import { Socket } from 'electron-ipc-socket';

const socket = new Socket('main-win', ipcRenderer);

socket.open();

socket
    .request('ping')
    .then(content => console.log(content))
    .catch(err => console.error(err));
```

##### Async request handler

```typescript
// main-process.js

import { ipcMain, BrowserWindow } from 'electron';
import { Socket, Transport, Event, InboundRequest } from 'electron-ipc-socket';
import fs from 'fs';
import util from 'util';

const read = util.promisify(fs.read);
const win = new BrowserWindow();

const socket = new Socket('main-win', new Transport(ipcMain, win));

socket.open();

socket.onRequest('file', async (req: InboundRequest) => {
    return read(req.data);
});
```

```typescript
// renderer-process.js

import { ipcRenderer } from 'electron';
import { Socket } from 'electron-ipc-socket';

const socket = new Socket('main-win', ipcRenderer);

socket.open();

socket
    .request('file', 'package.json')
    .then(content => console.log(content))
    .catch(err => console.error(err));
```
