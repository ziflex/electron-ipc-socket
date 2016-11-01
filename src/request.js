import Symbol from 'es6-symbol';
import _ from 'lodash';
import createClass from 'legion-common/lib/utils/create-class';
import DisposableMixin from 'legion-common/lib/runtime/disposable-mixin';
import disposableDecorator from 'legion-common/lib/runtime/disposable-decorator';
import { requires } from 'legion-common/lib/utils/contracts';
import uuid from 'uuid';

const FIELDS = {
    id: Symbol('id'),
    timestamp: Symbol('timestamp'),
    callback: Symbol('callback')
};

const Request = createClass({
    mixins: [
        DisposableMixin(_.values(FIELDS))
    ],

    decorators: [
        disposableDecorator
    ],

    constructor(callback) {
        requires('callback', callback);

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
        this[FIELDS.callback](reason);
        this.dispose();
    }
});

export default function create(...args) {
    return new Request(...args);
}
