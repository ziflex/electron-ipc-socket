export class NotFoundError extends Error {
    constructor(path: string) {
        super(`Handler for "${path}" not found`);
    }
}
