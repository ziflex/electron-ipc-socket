export class IpcError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(message);
        this.name = new.target.name;
        this.code = code;
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
