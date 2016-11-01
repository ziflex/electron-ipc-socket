import Symbol from 'es6-symbol';
import composeClass from 'compose-class';
import DisposableMixin from 'disposable-mixin';
import disposableDecorator from 'disposable-decorator';
import isNil from 'is-nil';
import isFunction from 'is-function';
import forEach from 'foreach';
import { requires, assert } from './assertions';

const ERR_INPUT_TYPE = 'Input must have "on", "once", "removeListener" and "removeAllListeners" methods';
const ERR_OUTPUT_TYPE = 'Output must have "send" method';

const FIELDS = {
    input: Symbol('input'),
    output: Symbol('output'),
    handlers: Symbol('handlers')
};

function addHandler(instance, channel, handler, once = false) {
    const that = instance;
    let channels = that[FIELDS.handlers];

    if (!once) {
        that[FIELDS.input].on(channel, handler);
    } else {
        that[FIELDS.input].once(channel, handler);
    }

    if (isNil(channels)) {
        channels = {};
        that[FIELDS.handlers] = channels;
    }

    let handlers = channels[channel];

    if (isNil(handlers)) {
        handlers = [];
        that[FIELDS.handlers][channel] = handlers;
    }

    handlers.push(handler);
}

function removeHandlers(instance, channel) {
    const that = instance;
    const handlers = that[FIELDS.handlers][channel];

    forEach(handlers, (currentHandler) => {
        that[FIELDS.input].removeListener(channel, currentHandler);
    });

    that[FIELDS.handlers][channel] = null;
}

function removeHandler(instance, channel, handler) {
    const that = instance;
    const handlers = that[FIELDS.handlers][channel];

    if (isNil(handlers) || !handlers.length) {
        return;
    }

    if (isNil(handler)) {
        removeHandlers(instance, channel);
        return;
    }

    that[FIELDS.input].removeListener(channel, handler);

    const index = handlers.indexOf(handler);

    if (index > -1) {
        handlers.splice(index, 1);
    }
}

function removeAllHandlers(instance) {
    const that = instance;

    forEach(that[FIELDS.handlers], (handlers, channel) => {
        removeHandlers(that, channel);
    });

    that[FIELDS.handlers] = null;
}

function finalize(instance) {
    instance.removeAllListeners();
}

const Class = composeClass({
    mixins: [
        DisposableMixin([
            FIELDS.input,
            FIELDS.output
        ], finalize)
    ],

    decorators: [
        disposableDecorator
    ],

    constructor(input, output) {
        requires('input', input);

        this[FIELDS.input] = input;
        this[FIELDS.output] = output || input;
        this[FIELDS.handlers] = {};

        assert(
            ERR_INPUT_TYPE,
            isFunction(this[FIELDS.input].on) &&
            isFunction(this[FIELDS.input].once) &&
            isFunction(this[FIELDS.input].removeListener) &&
            isFunction(this[FIELDS.input].removeAllListeners)
        );
        assert(
            ERR_OUTPUT_TYPE,
            isFunction(this[FIELDS.output].send)
        );
    },

    on(channel, handler) {
        requires('channel', channel);
        requires('handler', handler);

        addHandler(this, channel, handler);

        return this;
    },

    once(channel, handler) {
        requires('channel', channel);
        requires('handler', handler);

        addHandler(this, channel, handler, true);

        return this;
    },

    off(channel, handler) {
        requires('channel', channel);

        this.removeListener(channel, handler);

        return this;
    },

    removeListener(channel, handler) {
        requires('channel', channel);

        removeHandler(this, channel, handler);

        return this;
    },

    removeAllListeners() {
        removeAllHandlers(this);

        return this;
    },

    send(channel, ...args) {
        requires('channel', channel);

        this[FIELDS.output].send(channel, ...args);

        return this;
    }
});

export function isTransport(target) {
    return target instanceof Class;
}

export function Transport(...args) {
    return new Class(...args);
}
