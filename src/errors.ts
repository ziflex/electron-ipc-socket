import type { StandardSchemaV1Issue } from './validation.js';

const ERROR_BRANDS = Symbol.for('electron-ipc-socket.errors.v4');

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
            state.names.has(this.name)
        );
    }

    constructor(code: string, message: string) {
        super(message);
        this.name = new.target.name;
        this.code = code;
        addErrorBrand(this, IpcError.name);
        addErrorBrand(this, new.target.name);
    }
}

export class ConnectionError extends IpcError {
    constructor(message = 'IPC session is not connected') {
        super('ERR_IPC_CONNECTION', message);
    }
}

export class DisposedError extends IpcError {
    constructor() {
        super('ERR_IPC_DISPOSED', 'IPC session is disposed');
    }
}

export class TimeoutError extends IpcError {
    constructor(timeout: number) {
        super('ERR_IPC_TIMEOUT', `IPC invocation timed out after ${timeout}ms`);
    }
}

export class AbortError extends IpcError {
    constructor(message = 'IPC invocation was aborted') {
        super('ERR_IPC_ABORTED', message);
    }
}

export class ProtocolError extends IpcError {
    constructor(message: string) {
        super('ERR_IPC_PROTOCOL', message);
    }
}

export class RpcError extends IpcError {
    constructor(code: string, message: string) {
        super(code, message);
        addErrorBrand(this, RpcError.name);
    }
}

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
        addErrorBrand(this, ValidationError.name);
    }
}

export class RemoteError extends IpcError {
    readonly remoteName: string;

    constructor(name: string, message: string, code = 'ERR_IPC_REMOTE') {
        super(code, message);
        this.name = 'RemoteError';
        this.remoteName = name;
    }
}
