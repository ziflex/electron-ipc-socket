import { InvalidTypeError } from './errors/invalid-type';

/*
 * Represents incoming request from another process
 */
export class InboundRequest {
    private __path: string;
    private __data: any;

    constructor(path: string, data: any) {
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
    public get data(): any {
        return this.__data;
    }
}
