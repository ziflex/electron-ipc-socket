# electron-ipc-socket

> Event based communication

Response-request abstraction on top of Electron IPC system.

[![npm version](https://badge.fury.io/js/electron-ipc-socket.svg)](https://www.npmjs.com/package/electron-ipc-socket)
[![Actions Status](https://github.com/ziflex/electron-ipc-socket/workflows/Node%20CI/badge.svg)](https://github.com/ziflex/electron-ipc-socket/workflows/Node%20CI/badge.svg)

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

const socket = new Socket(new Transport(ipcMain, win));

socket.open('main-win');

socket.onEvent('ready', (evt: Event) => {
    console.log('Renderer process is ready');
});
```

```typescript
// renderer-process.js

import { ipcRenderer } from 'electron';
import { Socket } from 'electron-ipc-socket';

const socket = new Socket(ipcRenderer);

socket.open('main-win');

socket.send('ready');
```

### Request-response

```typescript
// main-process.js

import { ipcMain, BrowserWindow } from 'electron';
import { Socket, Transport, Event, InboundRequest } from 'electron-ipc-socket';
import fs from 'fs';

const win = new BrowserWindow();

const socket = new Socket(new Transport(ipcMain, win));

socket.open('main-win');

socket.onRequest('ping', (req: InboundRequest) => {
    return 'pong';
});
```

```typescript
// renderer-process.js

import { ipcRenderer } from 'electron';
import { Socket } from 'electron-ipc-socket';

const socket = new Socket(ipcRenderer);

socket.open('main-win');

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

const socket = new Socket(new Transport(ipcMain, win));

socket.open('main-win');

socket.onRequest('file', async (req: InboundRequest) => {
    return read(req.data);
});
```

```typescript
// renderer-process.js

import { ipcRenderer } from 'electron';
import { Socket } from 'electron-ipc-socket';

const socket = new Socket(ipcRenderer);

socket.open('main-win');

socket
    .request('file', 'package.json')
    .then(content => console.log(content))
    .catch(err => console.error(err));
```
