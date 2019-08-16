import { DisposedError } from '../errors/disposed';

export interface DisposableObject {
    dispose(): void;
    isDisposed(): boolean;
}
/*
 * Represents a disposable object.
 */
export class Disposable implements DisposableObject {
    public static assert(other: DisposableObject): void {
        if (other.isDisposed() === true) {
            throw new DisposedError(this.constructor.name);
        }
    }

    private __isDisposed: boolean;

    constructor() {
        this.__isDisposed = false;
    }

    /*
     * Indicates whether the instance is destroyed.
     */
    public isDisposed(): boolean {
        return this.__isDisposed;
    }

    /*
     * Destroys the instance.
     */
    public dispose(): void {
        Disposable.assert(this);

        this.__isDisposed = true;
    }
}
