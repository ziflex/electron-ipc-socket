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

### Transport
Represents an wrapper for one or two Electron IPC objects.
Exposes same public API.

#### Constructor(input [, output])
- ``input`` input IPC for listening to events.
- ``output`` output IPC for sending messages and emitting envents. Optional. Input IPC is used by default.

### Settings
Socket settings.    
Plain javascript ojbect.

- ``timeout`` request timeout.
- ``cleanup`` clean up interval.
