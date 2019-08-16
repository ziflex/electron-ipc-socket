export class DisposedError extends ReferenceError {
    constructor(name: string) {
        super(`"${name}" is already disposed`);
    }
}
