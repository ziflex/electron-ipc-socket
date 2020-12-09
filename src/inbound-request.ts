import { InvalidTypeError } from './errors/invalid-type';

/*
 * Represents incoming request from another process
 */
export class InboundRequest<T = any> {
    private __path: string;

    private __data: T;

    constructor(path: string, data: T) {
        if (typeof path !== 'string') {
            throw new InvalidTypeError('request path', String.name, path);
        }

        this.__path = path;
        this.__data = data;
    }

    /*
     * Returns request path
     */
    public get path(): string {
        return this.__path;
    }

    /*
     * Returns request payload
     */
    public get data(): T {
        return this.__data;
    }
}
