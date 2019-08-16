export class NotFoundError extends Error {
    constructor(path: string) {
        super(`Request handler for "${path}" path not found`);
    }
}
