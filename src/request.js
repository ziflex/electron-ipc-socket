import Symbol from 'es6-symbol';
import composeClass from 'compose-class';
import DisposableMixin from 'disposable-mixin';
import disposableDecorator from 'disposable-decorator';
import uuid from 'uuid';
import isFunction from 'is-function';
import isError from 'is-error';
import { requires, assert } from './utils/assertions';

const ERR_CALLBACK_TYPE = 'Callback must be a function';
const FIELDS = {
    id: Symbol('id'),
    timestamp: Symbol('timestamp'),
    callback: Symbol('callback')
};

const Request = composeClass({
    mixins: [
        DisposableMixin([
            FIELDS.id,
            FIELDS.timestamp,
            FIELDS.callback
        ])
    ],

    decorators: [
        disposableDecorator
    ],

    constructor(callback) {
        requires('callback', callback);
        assert(ERR_CALLBACK_TYPE, isFunction(callback));

        this[FIELDS.id] = uuid.v4();
        this[FIELDS.callback] = callback;
        this[FIELDS.timestamp] = new Date().getTime();
    },

    id() {
        return this[FIELDS.id];
    },

    timestamp() {
        return this[FIELDS.timestamp];
    },

    resolve(payload) {
        this[FIELDS.callback](null, payload);
        this.dispose();
    },

    reject(reason) {
        let err = reason;

        if (!isError(reason)) {
            if (reason) {
                err = new Error(reason);
            } else {
                err = new Error('Uknown reason');
            }
        }

        this[FIELDS.callback](err);
        this.dispose();
    }
});

export default function create(...args) {
    return new Request(...args);
}
