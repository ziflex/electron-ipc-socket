export class TimeoutError extends Error {
    constructor() {
        super('Request timed out');
    }
}
