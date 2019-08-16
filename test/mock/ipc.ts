import { EventEmitter } from 'events';
import isError from 'is-error';
import {
    TransportInput,
    TransportInputListener,
    TransportOutput,
} from '../../src/transport';

class NativeEvent {
    get sender(): void {
        throw new Error('Sender must not be used');
    }
}

function send(channel: string, ...args: any[]): any {
    return this.emit(channel, new NativeEvent(), ...args);
}

export class IPC implements TransportInput, TransportOutput {
    private __input: TransportInput & TransportOutput;
    private __output: EventEmitter & TransportOutput;

    constructor() {
        this.__input = new EventEmitter() as any;
        this.__input.send = send.bind(this.__input);

        this.__output = new EventEmitter() as any;
        this.__output.send = send.bind(this.__output);
    }

    public get input(): TransportInput & TransportOutput {
        return this.__input;
    }

    public get output(): TransportInput & TransportOutput {
        return this.__output;
    }

    public on(channel: string, listener: TransportInputListener): this {
        this.__input.on(channel, listener);

        return this;
    }

    public once(channel: string, handler: TransportInputListener): this {
        this.__input.once(channel, handler);

        return this;
    }

    public removeListener(
        channel: string,
        handler: TransportInputListener,
    ): this {
        this.__input.removeListener(channel, handler);

        return this;
    }

    public removeAllListeners(): this {
        this.__input.removeAllListeners();

        return this;
    }

    public send(channel: string, ...args: any[]): this {
        this.__output.emit(channel, ...args);

        return this;
    }
}
