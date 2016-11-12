import composeClass from 'compose-class';
import { EventEmitter } from 'events';
import isError from 'is-error';
import forEach from '../../src/utils/for-each';

class NativeEvent {
    get sender() {
        throw new Error('Sender must not be used');
    }
}

function send(channel, ...args) {
    return this.emit(channel, new NativeEvent(), ...args);
}

const IPC = composeClass({
    constructor() {
        this.input = new EventEmitter();
        this.input.send = send.bind(this.input);

        this.output = new EventEmitter();
        this.output.send = send.bind(this.output);
    },

    on(channel, handler) {
        this.input.on(channel, handler);

        return this;
    },

    once(channel, handler) {
        this.input.once(channel, handler);

        return this;
    },

    removeListener(channel, handler) {
        this.input.removeListener(channel, handler);

        return this;
    },

    removeAllListeners() {
        this.input.removeAllListeners();

        return this;
    },

    send(channel, ...args) {
        const data = [];

        forEach(args, (arg) => {
            if (isError) {

            }
        })

        this.output.emit(channel, ...args);

        return this;
    }
});

export default function create() {
    return new IPC();
}
