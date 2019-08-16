export class SocketClosedError extends Error {
    constructor() {
        super('Socket is already closed');
    }
}

export class SocketOpenError extends Error {
    constructor() {

        super('Socket is already open');

    }
}
