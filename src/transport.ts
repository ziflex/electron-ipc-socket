import { Disposable } from './core/disposable';
import { Observable, Subscriber, Subscription } from './core/observable';
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

export class Transport extends Observable {
    private __input: TransportInput;
    private __output: TransportOutput;

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
    }

    public dispose(): void {
        super.dispose();
    }

    public send(channel: string, ...args: any[]): void {
        Disposable.assert(this);
        requires('channel', channel);

        this.__output.send(channel, ...args);
    }

    public on(
        channel: string | symbol,
        subscriber: Subscriber,
        once: boolean = false,
    ): Subscription {
        Disposable.assert(this);
        requires('channel', channel);
        requires('subscriber', subscriber);

        const fn = !once ? this.__input.on : this.__input.once;

        fn.call(this.__input, channel, (_: any, ...args: any[]) => {
            subscriber(args);
        });

        return () => {
            if (this.__input != null) {
                this.__input.removeListener(channel, subscriber);
            }
        };
    }
}
