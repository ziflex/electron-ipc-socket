import Symbol from 'es6-symbol';
import composeClass from 'compose-class';
import DisposableMixin from 'disposable-mixin';
import disposableDecorator from 'disposable-decorator';
import isFunction from 'is-function';
import isDOMElement from './is-element';
import { requires, assert } from './assertions';

const ERR_ELEMENT_TYPE = 'Element must be an DOM element';
const ERR_ELEMENT_SEND_METHOD_NOT_FOUND = 'Element must have a "send" method';

const FIELDS = {
    element: Symbol('element')
};

const DomElement = composeClass({
    mixins: [
        DisposableMixin([
            FIELDS.element,
            FIELDS.output
        ])
    ],

    decorators: [
        disposableDecorator
    ],

    constructor(element) {
        requires('element', element);
        assert(ERR_ELEMENT_TYPE, isDOMElement(element));
        assert(ERR_ELEMENT_SEND_METHOD_NOT_FOUND, isFunction(element.send));

        this[FIELDS.element] = element;
    },

    addListener(eventName, eventHandler) {
        this[FIELDS.element].addEventListener(eventName, eventHandler);

        return this;
    },

    on(eventName, eventHandler) {
        return this.addListener(eventName, eventHandler);
    },

    once(eventName, eventHandler) {
        const handler = (...args) => {
            eventHandler(...args);

            if (this[FIELDS.element]) {
                this[FIELDS.element].removeEventListener(eventName, handler);
            }
        };

        this[FIELDS.element].addEventListener(eventName, handler);

        return this;
    },

    off(eventName, eventHandler) {
        return this.removeListener(eventName, eventHandler);
    },

    removeListener(eventName, eventHandler) {
        this[FIELDS.element].removeEventListener(eventName, eventHandler);

        return this;
    },

    removeAllListeners() {
        throw new Error('Not implemented');
    },

    send(channel, ...args) {
        this[FIELDS.element].send(channel, ...args);

        return this;
    }
});

export default function create(...args) {
    return new DomElement(...args);
}
