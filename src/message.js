import Symbol from 'es6-symbol';
import composeClass from 'compose-class';
import DisposableMixin from 'disposable-mixin';
import disposableDecorator from 'disposable-decorator';
import isError from 'is-error';
import { requires } from './utils/assertions';

const FIELDS = {
    evt: Symbol('evt'),
    id: Symbol('id'),
    type: Symbol('type'),
    data: Symbol('data'),
    callback: Symbol('callback')
};

const Message = composeClass({
    mixins: [
        DisposableMixin([
            FIELDS.evt,
            FIELDS.id,
            FIELDS.type,
            FIELDS.data,
            FIELDS.callback
        ])
    ],

    decorators: [
        disposableDecorator
    ],

    constructor(evt, id, type, data, callback) {
        requires('evt', evt);
        requires('id', id);
        requires('type', type);
        requires('callback', callback);

        this[FIELDS.evt] = evt;
        this[FIELDS.id] = id;
        this[FIELDS.type] = type;
        this[FIELDS.data] = data;
        this[FIELDS.callback] = callback;
    },

    type() {
        return this[FIELDS.type];
    },

    data() {
        return this[FIELDS.data];
    },

    reply(payload) {
        const err = isError(payload) ? payload : null;
        const data = err ? null : payload;

        this[FIELDS.callback](
            this[FIELDS.evt],
            this[FIELDS.id],
            err,
            data
        );

        this.dispose();
    }
});

export default function create() {
    return new Message(...arguments);
}
