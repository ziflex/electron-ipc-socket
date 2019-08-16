export class RequiredError extends ReferenceError {
    constructor(name: string) {
        super(`"${name}" is required`);
    }
}
