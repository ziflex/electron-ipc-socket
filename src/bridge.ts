import { Disposable } from './core/disposable';
import { InvalidTypeError } from './errors/invalid-type';
import { SocketClosedError, SocketOpenError } from './errors/socket';
import { Socket } from './socket';
import { assert } from './utils/assertions';

export class Bridge extends Disposable {
    private __first: Socket;
    private __second: Socket;
    private __isOpen: boolean;

    constructor(first: Socket, second: Socket) {
        super();

        if (!(first instanceof Socket)) {
            throw new InvalidTypeError('first socket', Socket.name, first);
        }

        if (!(second instanceof Socket)) {
            throw new InvalidTypeError('second socket', Socket.name, second);
        }

        this.__first = first;
        this.__second = second;
        this.__isOpen = false;
    }

    public get isOpen(): boolean {
        return this.__isOpen;
    }

    public open(): void {
        Disposable.assert(this);
        assert(SocketOpenError, !this.__isOpen);

        this.__isOpen = true;

        // const first = this[FIELDS.first];
        // const second = this[FIELDS.second];

        // if (!first.isOpen()) {
        //     first.open();
        // }

        // if (!second.isOpen()) {
        //     second.open();
        // }

        // const handlers = this[FIELDS.handlers];

        // first.on('message', handlers.messages.first);
        // second.on('message', handlers.messages.second);

        // first.on('event', handlers.events.first);
        // second.on('event', handlers.events.second);
    }

    public close(): void {
        Disposable.assert(this);
        assert(SocketClosedError, this.__isOpen);

        this.__isOpen = false;

        // const first = this[FIELDS.first];
        // const second = this[FIELDS.second];

        // if (first.isOpen()) {
        //     first.close();
        // }

        // if (second.isOpen()) {
        //     second.close();
        // }

        // const handlers = this[FIELDS.handlers];

        // first.off('message', handlers.messages.first);
        // second.off('message', handlers.messages.second);

        // first.off('event', handlers.events.first);
        // second.off('event', handlers.events.second);
    }
}
