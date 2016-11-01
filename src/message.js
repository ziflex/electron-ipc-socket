import Symbol from 'es6-symbol';
import _ from 'lodash';
import createClass from 'legion-common/lib/utils/create-class';
import DisposableMixin from 'legion-common/lib/runtime/disposable-mixin';
import disposableDecorator from 'legion-common/lib/runtime/disposable-decorator';
import { requires } from 'legion-common/lib/utils/contracts';

const FIELDS = {
    evt: Symbol('evt'),
    id: Symbol('id'),
    type: Symbol('type'),
    payload: Symbol('payload'),
    callback: Symbol('callback')
};

const Message = createClass({
    mixins: [
        DisposableMixin(_.values(FIELDS))
    ],

    decorators: [
        disposableDecorator
    ],

    constructor(evt, id, type, payload, callback) {
        requires('evt', evt);
        requires('id', id);
        requires('type', type);
        requires('callback', callback);

        this[FIELDS.evt] = evt;
        this[FIELDS.id] = id;
        this[FIELDS.type] = type;
        this[FIELDS.payload] = payload;
        this[FIELDS.callback] = callback;
    },

    type() {
        return this[FIELDS.type];
    },

    data() {
        return this[FIELDS.payload];
    },

    reply(payload) {
        this[FIELDS.callback](
            this[FIELDS.evt],
            this[FIELDS.id],
            payload
        );

        this.dispose();
    }
});

export default function create(...args) {
    return new Message(...args);
}
