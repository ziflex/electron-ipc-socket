/* eslint-disable no-param-reassign */
import Symbol from 'es6-symbol';
import composeClass from 'compose-class';
import DisposableMixin from 'disposable-mixin';
import disposableDecorator from 'disposable-decorator';
import { requires, assert } from './utils/assertions';
import { isSocket } from './socket';

const ERR_INPUT_TYPE = 'Input value must be a socket';
const ERR_BRIDGE_OPEN = 'Bridge is already open';
const ERR_BRIDGE_CLOSED = 'Bridge is already closed';

const FIELDS = {
    first: Symbol('first'),
    second: Symbol('second'),
    isOpen: Symbol('isOpen'),
    handlers: Symbol('handlers')
};

const METHODS = {
    onMessage: Symbol('onMessage'),
    onEvent: Symbol('onEvent')
};

function finalize(instance) {
    if (instance.isOpen()) {
        instance.close();
    }

    instance[FIELDS.first] = null;
    instance[FIELDS.second] = null;
}

const Bridge = composeClass({
    mixins: [
        DisposableMixin([
            FIELDS.handlers
        ], finalize)
    ],

    decorators: [
        disposableDecorator
    ],

    constructor(first, second) {
        requires('first', first);
        requires('second', second);
        assert(ERR_INPUT_TYPE, isSocket(first));
        assert(ERR_INPUT_TYPE, isSocket(second));

        this[METHODS.onMessage] = (target) => {
            return (msg) => {
                target.send(msg.type(), msg.data(), (err, payload) => {
                    if (err) {
                        return msg.reply(err);
                    }

                    return msg.reply(payload);
                });
            };
        };

        this[METHODS.onEvent] = (target) => {
            return (data, event) => {
                target.send(event, data);
            };
        };

        this[FIELDS.first] = first;
        this[FIELDS.second] = second;
        this[FIELDS.isOpen] = false;
        this[FIELDS.handlers] = {
            messages: {
                first: this[METHODS.onMessage](second),
                second: this[METHODS.onMessage](first)
            },
            events: {
                first: this[METHODS.onEvent](second),
                second: this[METHODS.onEvent](first)
            }
        };
    },

    isOpen() {
        return this[FIELDS.isOpen];
    },

    open() {
        assert(ERR_BRIDGE_OPEN, !this.isOpen());

        this[FIELDS.isOpen] = true;

        const first = this[FIELDS.first];
        const second = this[FIELDS.second];

        if (!first.isOpen()) {
            first.open();
        }

        if (!second.isOpen()) {
            second.open();
        }

        const handlers = this[FIELDS.handlers];

        first.on('message', handlers.messages.first);
        second.on('message', handlers.messages.second);

        first.on('event', handlers.events.first);
        second.on('event', handlers.events.second);

        return this;
    },

    close() {
        assert(ERR_BRIDGE_CLOSED, this.isOpen());

        this[FIELDS.isOpen] = false;

        const first = this[FIELDS.first];
        const second = this[FIELDS.second];

        if (first.isOpen()) {
            first.close();
        }

        if (second.isOpen()) {
            second.close();
        }

        const handlers = this[FIELDS.handlers];

        first.off('message', handlers.messages.first);
        second.off('message', handlers.messages.second);

        first.off('event', handlers.events.first);
        second.off('event', handlers.events.second);

        return this;
    }
});

export default function create(first, second) {
    return new Bridge(first, second);
}
