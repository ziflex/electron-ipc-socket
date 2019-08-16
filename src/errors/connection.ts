export class ConnectionLostError extends Error {
    constructor() {
        super('Connection lost');
    }
}
