import composeClass from 'compose-class';
import { EventEmitter } from 'events';

const IPC = composeClass({
    constructor() {
        this.input = new EventEmitter();
        this.output = new EventEmitter();
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
        this.output.emit(channel, ...args);

        return this;
    }
});

export default function create() {
    return new IPC();
}
