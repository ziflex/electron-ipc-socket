# electron-ipc-socket

> Event based communication

Response-request abstraction on top of Electron IPC system.

[![npm version](https://badge.fury.io/js/electron-ipc-socket.svg)](https://www.npmjs.com/package/electron-ipc-socket)
[![Build Status](https://secure.travis-ci.org/ziflex/electron-ipc-socket.svg?branch=master)](http://travis-ci.org/ziflex/electron-ipc-socket)
[![Coverage Status](https://coveralls.io/repos/github/ziflex/electron-ipc-socket/badge.svg?branch=master)](https://coveralls.io/github/ziflex/electron-ipc-socket)

````sh
    npm install --save electron-ipc-socket
````

## Motivation

Events are good, but sometimes you want something more than just 'emit and forget'.
Current package provides an abstraction on top of Electron IPC system that allows you to make 'request-response' communication.

## Usage

### Basic

````javascript
// main-process.js

import { ipcMain, BrowserWindow } from 'electron';
import { Socket, Transport } from 'electron-ipc-socket';
import fs from 'fs';

const win = new BrowserWindow();

const socket = Socket('main-win', Transport(ipcMain, win));

socket.open();

socket.on('event:ready', () => {
    console.log('message from rendering process');
});

socket.on('message:read-file', (msg) => {
    fs.readFile(msg.data(), 'utf8', (err, content) => {
        if (err) {
            return msg.reply(err);
        }

        return msg.reply(content);
    })
});

````

````javascript
// renderer-process.js

import { ipcRenderer } from 'electron';
import { Socket } from 'electron-ipc-socket';

const socket = Socket('main-win', ipcRenderer);

socket.open();

socket.send('ready');

socket.send('read-file', './package.json', (err, content) => {
    if (err) {
        console.error(err);
        return;
    }

    console.log(content);
});

````

### Bridging

````javascript
// main-process.js

import { ipcMain, BrowserWindow } from 'electron';
import { Socket, Transport } from 'electron-ipc-socket';
import fs from 'fs';

const win = new BrowserWindow();

const socket = Socket('main-win', Transport(ipcMain, win));

socket.open();

socket.on('event:ready', () => {
    console.log('message from rendering process');
});

socket.on('message:read-file', (msg) => {
    fs.readFile(msg.data(), 'utf8', (err, content) => {
        if (err) {
            return msg.reply(err);
        }

        return msg.reply(content);
    })
});

````

````javascript
// renderer-process.js

import { ipcRenderer } from 'electron';
import { Socket, Bridge } from 'electron-ipc-socket';

const webview = document.getElementById('guest');

const host = Socket('main-win', ipcRenderer);
const guest = Socket('main-win', webview);

const bridge = Bridge(host, guest);

bridge.open();

````

````javascript
// webview.js

import { ipcRenderer } from 'electron';
import { Socket, Transport } from 'electron-ipc-socket';

const socket = Socket('main-win', Transport(ipcRenderer, {
    send(...args) {
        ipcRenderer.sendToHost(...args);
    }
}));

socket.open();

socket.send('ready');

socket.send('read-file', './package.json', (err, content) => {
    if (err) {
        console.error(err);
        return;
    }

    console.log(content);
});

````

## API

### Socket
Provides 'request-response' abstraction on top of Electron IPC system.

#### Constructor(channel: string, transport: (Transport|IPC), settings: Settings)
- ``channel`` channel name for isolated communication.
- ``transport`` low-lever communication transport. Either electron IPC or instance of Transport.
- ``settings`` set of internal settings.

#### .isOpen()
Returns a value which indicates whether the socket is open.

#### .open()
Opens a socket.

#### .send(name: string [, payload: any] [, handler: Function])
Sends a message or emits an event.    

In order to send a message it needs to:
- pass a message name
- pass a response handler with a signature ``Function(response: any)``
- optionally it's possible to send a payload after message name

In order to emit an event it needs to:
- pass an event name
- omit a response handler
- optionally it's possible to send a payload after event name

#### .on(name: string, handler: Function)
Adds a message or an event handler.    

In order to add a message handler:
- pass a message name with prefix ``message:``
- pass a message handler with a signature ``Function(message: Message)``    

``message`` object has 3 methods:
- ``.type()`` returns a message type (name)
- ``.data()`` returns a message payload
- ``.reply([payload: any])`` responds to a request

*There can be only one message handler for each message name.*

In order to add an event handler it needs to:
- pass event name with prefix ``event:``
- pass a message handler with a signature ``Function(payload: any)``

It is possible to add a generic handler for all messages and events by passing just either ``message`` or ``event``.

#### .off(name: string [, handler: Function]])
Removes a message or an event handler.    

In order to remove a message handler it needs to:
- pass a message name with prefix ``message:``
- pass a message handler

In order to remove an event handler it needs to:
- pass event name with prefix ``event:``
- pass a message handler

In order to remove all event handlers for specific event it needs to omit handler.
In order to remove all event handler it needs to pass only ``event`` as an event name.

#### .close()
Closes a socket.

#### Events
A socket class has a set of internal events.

All handlers receives socket instance as a first argument.

##### open
Fired when socket is opened

##### close
Fired when socket is closed

##### error
Fired when unhandled error occured. Sends an object that has properties:   
- ``error`` error object
- ``type`` handler type. ``message`` or ``event``
- ``name`` event/message name.


### Bridge
Represents a communication bridge between 2 sockets.

#### Constructor(first: Socket, second: Socket)

#### .open()
Opens a bridge and starts delegating messages and events back and forth.

#### .close()
Closes a bridge and stops delegating messages and events back and forth.

#### .dispose()
Disposes a bridge and releases sockets.

### Transport
Represents an wrapper for one or two Electron IPC objects.
Exposes same public API.

#### Constructor(input: IPC [, output: IPC])
- ``input`` input IPC for listening to events.
- ``output`` output IPC for sending messages and emitting envents. Optional. Input IPC is used by default.

### Settings
Socket settings.    
Plain javascript ojbect.

- ``timeout`` request timeout.
- ``cleanup`` clean up interval.
