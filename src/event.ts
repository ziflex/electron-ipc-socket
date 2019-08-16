export class Event<T = any> {
    private __name: string;
    private __data?: T;

    constructor(name: string, data?: T) {
        this.__name = name;
        this.__data = data;
    }

    public get name(): string {
        return this.__name;
    }

    public get data(): T | undefined {
        return this.__data;
    }
}
