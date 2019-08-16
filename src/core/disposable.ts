import { DisposedError } from '../errors/disposed';

export interface DisposableObject {
    dispose(): void;
    isDisposed(): boolean;
}

export class Disposable implements DisposableObject {
    public static assert(other: DisposableObject): void {
        if (other.isDisposed() === true) {
            throw new DisposedError(this.constructor.name);
        }
    }

    public static isDisposable(object?: DisposableObject): boolean {
        if (object == null) {
            return false;
        }

        return (
            typeof object.dispose === 'function' &&
            typeof object.isDisposed === 'function'
        );
    }

    public static dispose(object: DisposableObject | Object): void {
        const disposable = object as DisposableObject;

        if (Disposable.isDisposable(disposable)) {
            if (!disposable.isDisposed()) {
                disposable.dispose();
            }

            return;
        }

        Disposable.disposeResources(object, Object.keys(object));
    }

    public static disposeResources(object: Object, resources: string[]): void {
        const target = object;

        resources.forEach(key => {
            const resource = target[key];

            if (Disposable.isDisposable(resource)) {
                if (!resource.isDisposed()) {
                    resource.dispose();
                }
            }

            target[key] = undefined;
        });
    }

    private __isDisposed: boolean;

    constructor() {
        this.__isDisposed = false;
    }

    public isDisposed(): boolean {
        return this.__isDisposed;
    }

    public dispose(): void {
        Disposable.assert(this);

        this.__isDisposed = true;
    }
}
