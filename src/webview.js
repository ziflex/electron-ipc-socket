/* eslint-disable no-param-reassign */
import Symbol from 'es6-symbol';
import composeClass from 'compose-class';
import DisposableMixin from 'disposable-mixin';
import disposableDecorator from 'disposable-decorator';
import isFunction from 'is-function';
import forEach from './utils/for-each';
import isDOMElement from './utils/is-element';
import { requires, assert } from './utils/assertions';

const ERR_ELEMENT_TYPE = 'Element must be an DOM element';
const ERR_ELEMENT_SEND_METHOD_NOT_FOUND = 'Element must have a "send" method';

const FIELDS = {
    element: Symbol('element'),
    events: Symbol('events'),
    handle: Symbol('handle')
};

function findIndex(collection, iteratee) {
    let result = -1;

    forEach(collection, (item, idx) => {
        if (iteratee(item) === true) {
            result = idx;
            return false;
        }

        return true;
    });

    return result;
}

function removeAllHandlers(events) {
    forEach(events, (handlers) => {
        handlers.length = 0;
    });
}

function removeHandler(events, eventName, eventHandler) {
    const handlers = events[eventName];

    if (!handlers) {
        return;
    }

    const index = findIndex(handlers, i => i.handler === eventHandler);

    if (index > -1) {
        handlers.splice(index, 1);
    }
}

function addHandler(events, eventName, eventHandler, once = false) {
    let handlers = events[eventName];

    if (!handlers) {
        handlers = [];
        events[eventName] = handlers;
    }

    handlers.push({
        once,
        handler: eventHandler
    });
}

function finalize(instance) {
    instance[FIELDS.element].removeEventListener('ipc-message', instance[FIELDS.handle]);
}

const WebView = composeClass({
    mixins: [
        DisposableMixin([
            FIELDS.element,
            FIELDS.events
        ], finalize)
    ],

    decorators: [
        disposableDecorator
    ],

    constructor(element) {
        requires('element', element);
        assert(ERR_ELEMENT_TYPE, isDOMElement(element));
        assert(ERR_ELEMENT_SEND_METHOD_NOT_FOUND, isFunction(element.send));

        this[FIELDS.element] = element;
        this[FIELDS.events] = {};
        this[FIELDS.handle] = (evt, args) => {
            const handlers = this[FIELDS.events][evt.channel];
            let toRemove = null;

            forEach(handlers, (item) => {
                item.handler.apply(null, args);

                if (item.once) {
                    if (!toRemove) {
                        toRemove = [];
                    }

                    toRemove.push(item);
                }
            });

            if (toRemove) {
                forEach(toRemove, (item) => {
                    removeHandler(this[FIELDS.events], evt.channel, item.handler);
                });
            }
        };

        this[FIELDS.element].addEventListener('ipc-message', this[FIELDS.handle]);
    },

    addListener(eventName, eventHandler) {
        addHandler(this[FIELDS.events], eventName, eventHandler);

        return this;
    },

    on(eventName, eventHandler) {
        return this.addListener(eventName, eventHandler);
    },

    once(eventName, eventHandler) {
        addHandler(this[FIELDS.events], eventName, eventHandler, true);

        return this;
    },

    off(eventName, eventHandler) {
        return this.removeListener(eventName, eventHandler);
    },

    removeListener(eventName, eventHandler) {
        removeHandler(this[FIELDS.events], eventName, eventHandler);

        return this;
    },

    removeAllListeners() {
        removeAllHandlers(this[FIELDS.events]);

        return this;
    },

    send(channel, ...args) {
        this[FIELDS.element].send(channel, ...args);

        return this;
    }
});

export default function create(...args) {
    return new WebView(...args);
}
