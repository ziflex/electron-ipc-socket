import type { StandardSchemaV1Issue } from './validation.js';

const ERROR_BRANDS = Symbol.for('electron-ipc-socket.errors.v4');
const ERROR_CLASS_BRAND = Symbol.for(
    'electron-ipc-socket.error-class-brand.v4',
);

interface ErrorBrandState {
    readonly names: Set<string>;
}

function addErrorBrand(error: object, brand: string): void {
    const current = (error as Record<PropertyKey, unknown>)[ERROR_BRANDS];
    if (
        typeof current === 'object' &&
        current !== null &&
        'names' in current &&
        current.names instanceof Set
    ) {
        current.names.add(brand);
        return;
    }

    const state: ErrorBrandState = Object.freeze({
        names: new Set([brand]),
    });
    Object.defineProperty(error, ERROR_BRANDS, {
        configurable: false,
        enumerable: false,
        value: state,
        writable: false,
    });
}

function getErrorClassBrand(errorClass: { readonly name: string }): string {
    const brandedClass = errorClass as { readonly name: string } & Record<
        typeof ERROR_CLASS_BRAND,
        unknown
    >;
    if (Object.hasOwn(brandedClass, ERROR_CLASS_BRAND)) {
        const brand = brandedClass[ERROR_CLASS_BRAND];
        if (typeof brand === 'string') {
            return brand;
        }
    }

    return errorClass.name;
}

function setErrorClassBrand(
    errorClass: { readonly name: string },
    brand: string,
): void {
    Object.defineProperty(errorClass, ERROR_CLASS_BRAND, {
        configurable: false,
        enumerable: false,
        value: brand,
        writable: false,
    });
}

export class IpcError extends Error {
    readonly code: string;

    static override [Symbol.hasInstance](value: unknown): boolean {
        if (typeof value !== 'object' || value === null) {
            return false;
        }

        const state = (value as Record<PropertyKey, unknown>)[ERROR_BRANDS];
        return (
            typeof state === 'object' &&
            state !== null &&
            'names' in state &&
            state.names instanceof Set &&
            state.names.has(getErrorClassBrand(this))
        );
    }

    constructor(code: string, message: string) {
        super(message);
        this.name = getErrorClassBrand(new.target);
        this.code = code;
        addErrorBrand(this, getErrorClassBrand(IpcError));
        addErrorBrand(this, getErrorClassBrand(new.target));
    }
}
setErrorClassBrand(IpcError, 'IpcError');

export class ConnectionError extends IpcError {
    constructor(message = 'IPC session is not connected') {
        super('ERR_IPC_CONNECTION', message);
    }
}
setErrorClassBrand(ConnectionError, 'ConnectionError');

export class DisposedError extends IpcError {
    constructor() {
        super('ERR_IPC_DISPOSED', 'IPC session is disposed');
    }
}
setErrorClassBrand(DisposedError, 'DisposedError');

export class TimeoutError extends IpcError {
    constructor(timeout: number) {
        super('ERR_IPC_TIMEOUT', `IPC invocation timed out after ${timeout}ms`);
    }
}
setErrorClassBrand(TimeoutError, 'TimeoutError');

export class AbortError extends IpcError {
    constructor(message = 'IPC invocation was aborted') {
        super('ERR_IPC_ABORTED', message);
    }
}
setErrorClassBrand(AbortError, 'AbortError');

export class ProtocolError extends IpcError {
    constructor(message: string) {
        super('ERR_IPC_PROTOCOL', message);
    }
}
setErrorClassBrand(ProtocolError, 'ProtocolError');

export class RpcError extends IpcError {
    constructor(code: string, message: string) {
        super(code, message);
        addErrorBrand(this, getErrorClassBrand(RpcError));
    }
}
setErrorClassBrand(RpcError, 'RpcError');

export type ValidationTarget = 'event' | 'request' | 'result';

/** A local Standard Schema failure. Only its safe name, message, and code cross IPC. */
export class ValidationError extends RpcError {
    override readonly cause?: unknown;
    readonly issues: readonly StandardSchemaV1Issue[];
    readonly route: string;
    readonly target: ValidationTarget;

    constructor(
        target: ValidationTarget,
        route: string,
        issues: readonly StandardSchemaV1Issue[],
        cause?: unknown,
    ) {
        super(
            'ERR_IPC_VALIDATION',
            `Validation failed for ${target} route "${route}"`,
        );
        this.issues = issues;
        this.route = route;
        this.target = target;
        if (cause !== undefined) {
            this.cause = cause;
        }
        addErrorBrand(this, getErrorClassBrand(ValidationError));
    }
}
setErrorClassBrand(ValidationError, 'ValidationError');

export class RemoteError extends IpcError {
    readonly remoteName: string;

    constructor(name: string, message: string, code = 'ERR_IPC_REMOTE') {
        super(code, message);
        this.name = 'RemoteError';
        this.remoteName = name;
    }
}
setErrorClassBrand(RemoteError, 'RemoteError');
