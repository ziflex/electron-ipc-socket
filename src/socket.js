import Symbol from 'es6-symbol';
import EventEmitter from 'eventemitter3';
import _ from 'lodash';
import Promise from 'bluebird';
import createClass from 'legion-common/lib/utils/create-class';
import DisposableMixin from 'legion-common/lib/runtime/disposable-mixin';
import disposableDecorator from 'legion-common/lib/runtime/disposable-decorator';
import { requires, assert } from 'legion-common/lib/utils/contracts';
import Interval from 'legion-common/lib/time/interval';
import Request from './request';
import Message from './message';

const SOCKET_OPEN_ERR = 'Socket is already open';
const SOCKET_CLOSED_ERR = 'Socket is already closed';

const FIELDS = {
    channel: Symbol('channel'),
    transport: Symbol('transport'),
    emitter: Symbol('emitter'),
    isOpen: Symbol('isOpen'),
    pendingRequests: Symbol('pendingRequests'),
    handlers: Symbol('handlers'),
    requestTimeout: Symbol('requestTimeout'),
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

function onDispose() {
    this[FIELDS.emitter].removeAllListeners();

    if (this.isOpen()) {
        this.close();
    }
}

const Socket = createClass({
    mixins: [
        DisposableMixin(_.values(FIELDS), onDispose)
    ],

    decorators: [
        disposableDecorator
    ],

    constructor(channel, transport) {
        requires('channel', channel);
        requires('transport', transport);

        this[FIELDS.channel] = channel;
        this[FIELDS.transport] = transport;
        this[FIELDS.emitter] = new EventEmitter();
        this[FIELDS.pendingRequests] = {};
        this[FIELDS.handlers] = {};
        this[FIELDS.isOpen] = false;
        this[FIELDS.requestTimeout] = 1000 * 60;
        this[FIELDS.interval] = Interval(() => {
            const pendingRequests = this[FIELDS.pendingRequests];
            const currentTimestamp = new Date().getTime();
            const requestTimeout = this[FIELDS.requestTimeout];
            const hanging = [];

            _.forEach(pendingRequests, (request) => {
                if ((currentTimestamp - request.timestamp()) > requestTimeout) {
                    hanging.push(request);
                }
            });

            _.forEach(hanging, (request) => {
                const id = request.id();
                request.reject(new Error('Timeout'));

                delete pendingRequests[id];
            });
        }, 1000 * 60);

        this[METHODS.emit] = (event, payload) => {
            transport.send(`${channel}`, event, payload);
        };

        this[METHODS.request] = (req, path, payload) => {
            this[FIELDS.pendingRequests][req.id()] = req;

            transport.send(`${channel}:request`, req.id(), path, payload);
        };

        this[METHODS.respond] = (evt, id, payload) => {
            const receiver = evt.sender || transport;

            receiver.send(`${channel}:response`, id, payload);
        };

        this[METHODS.handleEvent] = (evt, type, payload) => {
            this[FIELDS.emitter].emit(`${channel}:${type}`, payload);
        };

        this[METHODS.handleResponse] = (evt, id, payload) => {
            const requests = this[FIELDS.pendingRequests];
            const request = requests[id];

            if (request) {
                if (!_.isError(payload)) {
                    request.resolve(payload);
                } else {
                    request.reject(payload);
                }

                delete requests[id];
            }
        };

        this[METHODS.handleRequest] = (evt, id, type, payload) => {
            const handlers = this[FIELDS.handlers];
            let handler = handlers[type];

            if (!_.isFunction(handler)) {
                handler = handlers['*'];
            }

            if (_.isFunction(handler)) {
                return handler(Message(evt, id, type, payload, this[METHODS.respond]));
            }

            return this[METHODS.respond](evt, id, new Error(`Message type not found: ${type}`));
        };
    },

    isOpen() {
        return this[FIELDS.isOpen];
    },

    open() {
        assert(SOCKET_OPEN_ERR, !this.isOpen());

        const channel = this[FIELDS.channel];
        const transport = this[FIELDS.transport];

        transport.on(`${channel}`, this[METHODS.handleEvent]);
        transport.on(`${channel}:request`, this[METHODS.handleRequest]);
        transport.on(`${channel}:response`, this[METHODS.handleResponse]);
        this[FIELDS.interval].start();
        this[FIELDS.isOpen] = true;

        return this;
    },

    sendMessage(name, payload) {
        assert(SOCKET_CLOSED_ERR, this.isOpen());

        return Promise.fromCallback((done) => {
            this[METHODS.request](Request(done), name, payload);
        });
    },

    onMessage(name, handler) {
        assert(
            `Handler is already defined for message: ${name}`,
            _.isNil(this[FIELDS.handlers][name])
        );

        this[FIELDS.handlers][name] = handler;

        return () => {
            const handlers = this[FIELDS.handlers];

            delete handlers[name];
        };
    },

    emitEvent(type, payload) {
        assert(SOCKET_CLOSED_ERR, this.isOpen());

        this[METHODS.emit](type, payload);

        return this;
    },

    onEvent(type, handler, once = false) {
        const eventName = `${this[FIELDS.channel]}:${type}`;

        if (once) {
            this[FIELDS.emitter].once(eventName, handler);
        } else {
            this[FIELDS.emitter].on(eventName, handler);
        }

        return () => {
            this[FIELDS.emitter].removeListener(eventName, handler);
        };
    },

    close() {
        assert('Socket is already closed', this.isOpen());

        const channel = this[FIELDS.channel];
        const transport = this[FIELDS.transport];

        transport.removeListener(`${channel}`, this[METHODS.handleEvent]);
        transport.removeListener(`${channel}:request`, this[METHODS.handleRequest]);
        transport.removeListener(`${channel}:response`, this[METHODS.handleResponse]);

        _.forEach(this[FIELDS.pendingRequests], (req) => {
            req.reject(new Error('Connection lost'));
        });

        this[FIELDS.pendingRequests] = {};
        this[FIELDS.interval].stop();
        this[FIELDS.isOpen] = false;

        return this;
    }
});

export default function create(...args) {
    return new Socket(...args);
}
