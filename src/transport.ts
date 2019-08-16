import nanoid from 'nanoid';
import { Disposable } from './core/disposable';
import { Subscriber, Subscription } from './core/observable';
import { RequiredError } from './errors/required';
import { InvalidInputError, InvalidOutputError } from './errors/transport';
import { requires } from './utils/assertions';

export interface TransportInput {
    on(event: string | symbol, listener: TransportInputListener): this;
    once(event: string | symbol, listener: TransportInputListener): this;
    removeListener(
        event: string | symbol,
        listener: TransportInputListener,
    ): this;
    removeAllListeners(event?: string | symbol): this;
}

export type TransportInputListener = (...args: any[]) => void;

export interface TransportOutput {
    send(channel: string | symbol, ...args: any[]): void;
}
export class Transport extends Disposable {
    private __input: TransportInput;
    private __output: TransportOutput;
    private __listeners: {
        [id: string]: {
            channel: string | symbol;
            fn: TransportInputListener;
        };
    };

    constructor(
        input: TransportInput | TransportInput & TransportOutput,
        output?: TransportOutput,
    ) {
        super();

        const int = input;
        let out = output;

        if (int == null) {
            throw new RequiredError('input');
        }

        if (out == null) {
            out = int as TransportOutput;
        }

        if (
            typeof int.on !== 'function' ||
            typeof int.once !== 'function' ||
            typeof int.removeAllListeners !== 'function' ||
            typeof int.removeListener !== 'function'
        ) {
            throw new InvalidInputError();
        }

        if (typeof out.send !== 'function') {
            throw new InvalidOutputError();
        }

        this.__input = int;
        this.__output = out;
        this.__listeners = Object.create(null);
    }

    public dispose(): void {
        super.dispose();

        Object.keys(this.__listeners).forEach((id: string) => {
            this.__unsubscribe(id);
        });

        delete this.__listeners;
    }

    public send(channel: string, ...args: any[]): void {
        Disposable.assert(this);
        requires('channel', channel);

        this.__output.send(channel, ...args);
    }

    public on(channel: string, subscriber: Subscriber): Subscription {
        Disposable.assert(this);
        requires('channel', channel);
        requires('subscriber', subscriber);

        const listener = (_: any, ...args: any[]) => {
            subscriber(args);
        };

        this.__input.on(channel, listener);

        const id = nanoid();

        this.__listeners[id] = {
            channel,
            fn: listener,
        };

        return this.__unsubscribe.bind(this, id);
    }

    private __unsubscribe(id: string): void {
        const pair = this.__listeners[id];

        if (pair != null) {
            this.__input.removeListener(pair.channel, pair.fn);
        }

        delete this.__listeners[id];
    }
}
