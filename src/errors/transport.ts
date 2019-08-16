export class InvalidInputError extends TypeError {
    constructor() {
        super(
            'Input must have "on", "once", "removeListener" and "removeAllListeners" methods',
        );
    }
}

export class InvalidOutputError extends TypeError {
    constructor() {
        super('Output must have "send" method');
    }
}
