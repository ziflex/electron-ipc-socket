import Symbol from 'es6-symbol';
import isNil from 'is-nil';
import isFunction from 'is-function';
import composeClass from 'compose-class';
import DisposableMixin from 'disposable-mixin';
import disposableDecorator from 'disposable-decorator';
import { requires, assert } from './utils/assertions';

const ERR_HANDLER_TYPE = 'Handler must be a function';
const ERR_PERIOD_TYPE = 'Period must be a number';
const FIELDS = {
    period: Symbol('period'),
    handler: Symbol('handler'),
    id: Symbol('id')
};
const isNumber = i => typeof i === 'number' && !isNaN(i);

function finalize(instance) {
    if (instance.isRunning()) {
        instance.stop();
    }
}

const Interval = composeClass({
    mixins: [
        DisposableMixin([
            FIELDS.period,
            FIELDS.handler,
            FIELDS.id
        ], finalize)
    ],

    decorators: [
        disposableDecorator
    ],

    constructor(handler, period) {
        requires('handler', handler);
        requires('period', period);
        assert(ERR_HANDLER_TYPE, isFunction(handler));
        assert(ERR_PERIOD_TYPE, isNumber(period));

        this[FIELDS.handler] = handler;
        this[FIELDS.period] = period;
        this[FIELDS.id] = null;
    },

    isRunning() {
        return !isNil(this[FIELDS.id]);
    },

    start() {
        assert('Interval is already running', !this.isRunning());

        this[FIELDS.id] = setInterval(this[FIELDS.handler], this[FIELDS.period]);

        return this;
    },

    stop() {
        assert('Interval is already stoped', this.isRunning());

        clearInterval(this[FIELDS.id]);
        this[FIELDS.id] = null;

        return this;
    }
});

export default function create(...args) {
    return new Interval(...args);
}
