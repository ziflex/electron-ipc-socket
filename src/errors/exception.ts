export class UnhandledExceptionError extends Error {
    public readonly reason: Error;

    constructor(reason: Error) {
        super(`Unhandled exception: ${reason.message}`);

        this.reason = reason;
    }
}
