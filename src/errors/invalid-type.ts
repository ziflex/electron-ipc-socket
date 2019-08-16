export class InvalidTypeError extends TypeError {
    constructor(name: string, expected: string, actual: any) {
        super(`Expected "${name}" to be ${expected}, but got ${typeof actual}`);
    }
}
