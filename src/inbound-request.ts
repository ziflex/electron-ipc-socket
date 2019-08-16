import isError from 'is-error';
import { Disposable } from './core/disposable';
import { InvalidTypeError } from './errors/invalid-type';

export type InboundRequestCallback = (
    path: string,
    id: string,
    err?: Error,
    data?: any,
) => void;

export class InboundRequest extends Disposable {
    private __path: string;
    private __id: string;
    private __data: any;
    private __callback: InboundRequestCallback;

    constructor(
        path: string,
        id: string,
        data: any,
        callback: InboundRequestCallback,
    ) {
        super();

        if (typeof path !== 'string') {
            throw new InvalidTypeError('request path', String.name, path);
        }

        if (typeof id !== 'string') {
            throw new InvalidTypeError('request id', String.name, id);
        }

        if (typeof callback !== 'function') {
            throw new InvalidTypeError(
                'request callback',
                Function.name,
                callback,
            );
        }

        this.__path = path;
        this.__id = id;
        this.__data = data;
        this.__callback = callback;
    }

    public get path(): string {
        return this.__path;
    }

    public get data(): any {
        return this.__data;
    }

    public reply(payload?: any): void {
        const err = isError(payload) ? payload : null;
        const data = err ? null : payload;

        this.__callback(this.__path, this.__id, err, data);
        this.dispose();
    }
}
