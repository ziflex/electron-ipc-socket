import { Disposable } from 'disposable-class';
import nanoid from 'nanoid';
import { InvalidTypeError } from './errors/invalid-type';

export type OutboundRequestResolveCallback = (data?: any) => void;
export type OutboundRequestRejectCallback = (reason: Error | string) => void;

export class OutboundRequest extends Disposable {
    private __id: string;
    private __timestamp: number;
    private __resolve: OutboundRequestResolveCallback;
    private __reject: OutboundRequestRejectCallback;

    constructor(
        resolve: OutboundRequestResolveCallback,
        reject: OutboundRequestRejectCallback,
    ) {
        super();

        if (typeof resolve !== 'function') {
            throw new InvalidTypeError(
                'request resolve callback',
                Function.name,
                resolve,
            );
        }

        if (typeof reject !== 'function') {
            throw new InvalidTypeError(
                'request resolve callback',
                Function.name,
                reject,
            );
        }

        this.__id = nanoid();
        this.__timestamp = Date.now();
        this.__resolve = resolve;
        this.__reject = reject;
    }

    public get id(): string {
        return this.__id;
    }

    public get timestamp(): number {
        return this.__timestamp;
    }

    public resolve(data?: any): void {
        super.dispose();

        this.__resolve(data);
    }

    public reject(reason: Error | string): void {
        super.dispose();

        this.__reject(reason);
    }
}
