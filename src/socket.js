import Symbol from 'es6-symbol';
import composeClass from 'compose-class';
import DisposableMixin from 'disposable-mixin';
import disposableDecorator from 'disposable-decorator';
import isNil from 'is-nil';
import isError from 'is-error';
import isFunction from 'is-function';
import forEach from './utils/for-each';
import { requires, assert } from './utils/assertions';
import Interval from './interval';
import Request from './request';
import Message from './message';
import { Transport, isTransport } from './transport';

const ERR_CHANNEL_TYPE = 'Channel must be non-empty string';
const ERR_MESSAGE_NAME_TYPE = 'Message name must be a non-empty string';
const ERR_HANDLER_TYPE = 'Handler must be a function';
const ERR_MSG_HANDLER_NOT_UNIQ = 'There is already reigstered handler for message';
const ERR_EVENT_TYPE = 'Unsupported event type';
const ERR_PATH_TYPE = 'Path must be a non-empty string';
const ERR_SOCKET_OPEN = 'Socket is already open';
const ERR_SOCKET_CLOSED = 'Socket is already closed';

const isString = i => typeof i === 'string';
const isNonEmptyString = i => isString(i) && i.trim() !== '';

const FIELDS = {
    channel: Symbol('channel'),
    transport: Symbol('transport'),
    isOpen: Symbol('isOpen'),
    pendingRequests: Symbol('pendingRequests'),
    handlers: Symbol('handlers'),
    requestTimeout: Symbol('requestTimeout'),
    cleanupInterval: Symbol('cleanupInterval'),
    interval: Symbol('interval')
};

const METHODS = {
    emit: Symbol('emit'),
    request: Symbol('request'),
    respond: Symbol('respond'),
    handleEvent: Symbol('handleEvent'),
    handleResponse: Symbol('handleResponse'),
    handleRequest: Symbol('handleRequest')
};

function notify(instance, internalEvent, payload) {
    const handlers = instance[FIELDS.handlers].internals[internalEvent];

    if (handlers) {
        forEach(handlers, handler => handler(instance, payload));
    }
}

function finalize(instance) {
    if (instance.isOpen()) {
        instance.close();
    }
}

const SocketClass = composeClass({
    mixins: [
        DisposableMixin([
            FIELDS.transport,
            FIELDS.pendingRequests,
            FIELDS.handlers,
            FIELDS.interval
        ], finalize)
    ],

    decorators: [
        disposableDecorator
    ],

    constructor(channel, transport, settings = {}) {
        requires('channel', channel);
        requires('transport', transport);
        assert(ERR_CHANNEL_TYPE, isNonEmptyString(channel));

        this[FIELDS.channel] = channel;
        this[FIELDS.transport] = isTransport(transport) ? transport : Transport(transport);
        this[FIELDS.pendingRequests] = {};
        this[FIELDS.handlers] = {
            events: {},
            requests: {},
            internals: {}
        };
        this[FIELDS.isOpen] = false;
        this[FIELDS.requestTimeout] = settings.timeout || 1000 * 60;
        this[FIELDS.cleanupInterval] = settings.cleanup || 1000 * 60;
        this[FIELDS.interval] = Interval(() => {
            const pendingRequests = this[FIELDS.pendingRequests];
            const currentTimestamp = new Date().getTime();
            const requestTimeout = this[FIELDS.requestTimeout];
            const hanging = [];

            forEach(pendingRequests, (request) => {
                if ((currentTimestamp - request.timestamp()) > requestTimeout) {
                    hanging.push(request);
                }
            });

            forEach(hanging, (request) => {
                const id = request.id();
                request.reject(new Error('Timeout'));

                delete pendingRequests[id];
            });
        }, this[FIELDS.cleanupInterval]);

        this[METHODS.emit] = (event, payload) => {
            transport.send(`${channel}:event`, event, payload);
        };

        this[METHODS.request] = (req, name, payload) => {
            this[FIELDS.pendingRequests][req.id()] = req;

            transport.send(`${channel}:request`, req.id(), name, payload);
        };

        this[METHODS.respond] = (evt, id, err, payload) => {
            const receiver = evt.sender || transport;
            const data = err ? null : payload;
            const error = err ? err.toString() : null;

            receiver.send(`${channel}:response`, id, error, data);
        };

        this[METHODS.handleEvent] = (evt, name, payload) => {
            let handlers = this[FIELDS.handlers].events[name];

            if (!handlers) {
                handlers = this[FIELDS.handlers].events['*'];
            }

            if (handlers) {
                try {
                    forEach(handlers, handler => handler(payload, name));
                } catch (e) {
                    notify(this, 'error', {
                        error: e,
                        type: 'event',
                        name
                    });
                }
            }
        };

        this[METHODS.handleResponse] = (evt, id, err, payload) => {
            const requests = this[FIELDS.pendingRequests];
            const request = requests[id];

            if (request) {
                if (err) {
                    request.reject(isError(err) ? err : new Error(err.toString()));
                } else {
                    request.resolve(payload);
                }

                delete requests[id];
            }
        };

        this[METHODS.handleRequest] = (evt, id, name, payload) => {
            const handlers = this[FIELDS.handlers].requests;
            let handler = handlers[name];

            if (!isFunction(handler)) {
                handler = handlers['*'];
            }

            if (isFunction(handler)) {
                const msg = Message(evt, id, name, payload, this[METHODS.respond]);

                try {
                    handler(msg);
                } catch (e) {
                    if (!msg.isDisposed()) {
                        msg.reply(e);
                    } else {
                        notify(this, 'error', {
                            error: e,
                            type: 'message',
                            name
                        });
                    }
                }

                return;
            }

            this[METHODS.respond](evt, id, new Error(`Message handler not found: ${name}`));
        };
    },

    isOpen() {
        return this[FIELDS.isOpen];
    },

    open() {
        assert(ERR_SOCKET_OPEN, !this.isOpen());

        const channel = this[FIELDS.channel];
        const transport = this[FIELDS.transport];

        transport.on(`${channel}:event`, this[METHODS.handleEvent]);
        transport.on(`${channel}:request`, this[METHODS.handleRequest]);
        transport.on(`${channel}:response`, this[METHODS.handleResponse]);
        this[FIELDS.interval].start();
        this[FIELDS.isOpen] = true;

        notify(this, 'open');

        return this;
    },

    send() {
        assert(ERR_SOCKET_CLOSED, this.isOpen());

        const name = arguments[0];
        let payload = arguments[1];
        let callback = arguments[2];

        requires('name', name);
        assert(ERR_MESSAGE_NAME_TYPE, isNonEmptyString(name));

        if (isFunction(payload)) {
            callback = payload;
            payload = null;
        }

        if (isFunction(callback)) {
            this[METHODS.request](Request(callback), name, payload);
        } else {
            this[METHODS.emit](name, payload);
        }

        return this;
    },

    on(path, handler) {
        requires('path', path);
        requires('handler', handler);
        assert(ERR_PATH_TYPE, isNonEmptyString(path));
        assert(ERR_HANDLER_TYPE, isFunction(handler));

        const [type, name] = path.split(':');

        /* eslint-disable indent */
        switch (type) {
            case 'message': {
                const messageName = name || '*';
                const handlers = this[FIELDS.handlers].requests;

                assert(
                    `${ERR_MSG_HANDLER_NOT_UNIQ}: ${messageName}`,
                    isNil(handlers[messageName])
                );

                handlers[messageName] = handler;

                break;
            }
            case 'event': {
                const eventName = name || '*';
                const handlers = this[FIELDS.handlers].events;

                let event = handlers[eventName];

                if (!event) {
                    event = [];
                    handlers[eventName] = event;
                }

                event.push(handler);

                break;
            }
            case 'error':
            case 'open':
            case 'close': {
                const handlers = this[FIELDS.handlers].internals;

                let event = handlers[type];

                if (!event) {
                    event = [];
                    handlers[type] = event;
                }

                event.push(handler);

                break;
            }
            default: {
                throw new Error(`${ERR_EVENT_TYPE}: ${type}`);
            }
        }
        /* eslint-enable */

        return this;
    },

    off(path, handler) {
        requires('path', path);
        assert(ERR_PATH_TYPE, isNonEmptyString(path));

        if (handler) {
            assert(ERR_HANDLER_TYPE, isFunction(handler));
        }

        const [type, name] = path.split(':');

        /* eslint-disable indent */
        switch (type) {
            case 'message': {
                const messageName = name || '*';

                if (messageName === '*') {
                    this[FIELDS.handlers].requests = {};
                    break;
                }

                if (!handler) {
                    delete this[FIELDS.handlers].requests[messageName];
                }

                break;
            }
            case 'event': {
                const eventName = name || '*';

                if (eventName === '*') {
                    this[FIELDS.handlers].events = {};
                    break;
                }

                const handlers = this[FIELDS.handlers].events[eventName];

                if (!handlers) {
                    break;
                }

                if (!handler) {
                    handlers.length = 0;

                    break;
                }

                const idx = handlers.indexOf(handler);

                if (idx > -1) {
                    handlers.splice(idx, 1);
                }

                break;
            }
            case 'error':
            case 'open':
            case 'close': {
                const handlers = this[FIELDS.handlers].internals[type];

                if (!handlers || handlers.length === 0) {
                    break;
                }

                const idx = handlers.indexOf(handler);

                if (idx > -1) {
                    handlers.splice(idx, 1);
                }

                break;
            }
            default: {
                throw new Error(`${ERR_EVENT_TYPE}: ${type}`);
            }
        }
        /* eslint-enable */
    },

    close() {
        assert('Socket is already closed', this.isOpen());

        const channel = this[FIELDS.channel];
        const transport = this[FIELDS.transport];

        transport.removeListener(`${channel}:event`, this[METHODS.handleEvent]);
        transport.removeListener(`${channel}:request`, this[METHODS.handleRequest]);
        transport.removeListener(`${channel}:response`, this[METHODS.handleResponse]);

        forEach(this[FIELDS.pendingRequests], (req) => {
            req.reject(new Error('Connection lost'));
        });

        this[FIELDS.pendingRequests] = {};
        this[FIELDS.interval].stop();
        this[FIELDS.isOpen] = false;

        notify(this, 'close');

        return this;
    }
});

export function isSocket(target) {
    return target instanceof SocketClass;
}

export function Socket() {
    return new SocketClass(...arguments);
}
