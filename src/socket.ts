import isError from 'is-error';
import { Interval } from 'pinterval';
import { Disposable } from './core/disposable';
import { Observable, Subscription } from './core/observable';
import { ConnectionLostError } from './errors/connection';
import { UnhandledExceptionError } from './errors/exception';
import { RequiredError } from './errors/required';
import { SocketClosedError, SocketOpenError } from './errors/socket';
import { TimeoutError } from './errors/timeout';
import { Event } from './event';
import { InboundRequest } from './inbound-request';
import { OutboundRequest } from './outbound-request';
import { Response } from './response';
import { Transport, TransportInput, TransportOutput } from './transport';
import { assert, requires } from './utils/assertions';

const REQUESTS = Math.random().toString();
const RESPONSES = Math.random().toString();
const EVENTS = Math.random().toString();

export type RequestHandler = (req: InboundRequest) => void;
export type EventHandler = (evt: Event) => void;

export interface Settings {
    timeout?: number;
    cleanup?: number;
}

export class Socket extends Observable {
    private __isOpen: boolean;
    private __channel: string;
    private __transport: Transport;
    private __interval: Interval;
    private __requestTimeout: number;
    private __cleanupInterval: number;
    private __pendingRequests?: { [id: string]: OutboundRequest };
    private __subscriptions?: Subscription[];

    constructor(
        channel: string,
        transport: Transport | TransportInput & TransportOutput,
        settings: Settings = {},
    ) {
        super();

        if (typeof channel !== 'string' || channel.trim() === '') {
            throw new RequiredError('channel id');
        }

        if (transport == null) {
            throw new RequiredError('transport');
        }

        if (transport instanceof Transport) {
            this.__transport = transport;
        } else {
            this.__transport = new Transport(transport);
        }

        this.__isOpen = false;
        this.__channel = channel;
        this.__requestTimeout = settings.timeout || 1000 * 60;
        this.__cleanupInterval = settings.cleanup || 1000 * 60;
        this.__interval = new Interval({
            func: this.__cleanup.bind(this),
            time: this.__cleanupInterval,
        });
    }

    public get isOpen(): boolean {
        return this.__isOpen;
    }

    public dispose(): void {
        super.dispose();

        if (this.isOpen) {
            this.close();
        }

        this.__transport.dispose();
    }

    public open(): void {
        Disposable.assert(this);
        assert(SocketOpenError, !this.isOpen);

        const channel = this.__channel;
        const transport = this.__transport;

        this.__subscriptions = [
            transport.on(`${channel}:${EVENTS}`, this.__handleEvent.bind(this)),
            transport.on(
                `${channel}:${REQUESTS}`,
                this.__handleRequest.bind(this),
            ),
            transport.on(
                `${channel}:${RESPONSES}`,
                this.__handleResponse.bind(this),
            ),
        ];

        this.__isOpen = true;
        this.__pendingRequests = Object.create(null);
        this.__interval.start();

        super.emit('open');
    }

    public close(): void {
        Disposable.assert(this);
        assert(SocketClosedError, this.isOpen);

        this.__isOpen = false;
        this.__interval.stop();

        if (this.__subscriptions != null) {
            this.__subscriptions.forEach(i => i());
        }

        const pendingRequests = this.__pendingRequests;

        if (pendingRequests != null) {
            Object.keys(pendingRequests).forEach(id => {
                const req = pendingRequests[id];
                req.reject(new ConnectionLostError());
            });
        }

        super.emit('close');
    }

    public emit(event: string, payload?: any): void {
        Disposable.assert(this);
        assert(SocketClosedError, this.__isOpen);
        requires('event', event);

        this.__transport.send(`${this.__channel}:${EVENTS}`, event, payload);
    }

    public async request(path: string, payload?: any): Promise<Response> {
        Disposable.assert(this);
        assert(SocketClosedError, this.__isOpen);
        requires('path', path);

        return new Promise((resolve, reject) => {
            const req = new OutboundRequest(resolve, reject);
            const requests = this.__pendingRequests;

            if (requests) {
                try {
                    requests[req.id] = req;

                    this.__transport.send(
                        `${this.__channel}:${REQUESTS}`,
                        path,
                        req.id,
                        payload,
                    );
                } catch (e) {
                    if (!req.isDisposed()) {
                        req.reject(new UnhandledExceptionError(e));

                        delete requests[req.id];
                    }

                    super.emit('error', e);
                }
            }
        });
    }

    public onEvent(
        name: string,
        handler: EventHandler,
        once: boolean = false,
    ): Subscription {
        return super.on(`${EVENTS}/${name}`, handler, once);
    }

    public onRequest(
        path: string,
        handler: RequestHandler,
        once: boolean = false,
    ): Subscription {
        return super.on(`${REQUESTS}/${path}`, handler, once);
    }

    private __cleanup(): void {
        const pendingRequests = this.__pendingRequests;
        const currentTimestamp = Date.now();
        const requestTimeout = this.__requestTimeout;
        const hanging: OutboundRequest[] = [];

        if (pendingRequests == null) {
            return;
        }

        Object.keys(pendingRequests).forEach((id: string) => {
            const request = pendingRequests[id];

            if (currentTimestamp - request.timestamp > requestTimeout) {
                hanging.push(request);
            }
        });

        hanging.forEach((request: OutboundRequest) => {
            const id = request.id;
            request.reject(new TimeoutError());

            delete pendingRequests[id];
        });
    }

    private __handleEvent(data: any[]): void {
        const [name, id, payload] = data;

        try {
            super.emit(`${EVENTS}/${name}`, new Event(name, payload));
        } catch (e) {
            super.emit('error', new Event('error', e));
        }
    }

    private __handleRequest(data: any[]): void {
        const [path, id, payload] = data;
        const req = new InboundRequest(
            path,
            id,
            payload,
            this.__respond.bind(this),
        );

        try {
            super.emit(`${REQUESTS}/${path}`, req);
        } catch (e) {
            if (!req.isDisposed()) {
                req.reply(new UnhandledExceptionError(e));
            } else {
                super.emit('error', new Event('error', e));
            }
        }
    }

    private __handleResponse(data: any[]): void {
        const requests = this.__pendingRequests;

        if (requests == null) {
            return;
        }

        const [path, id, err, payload] = data;
        const request = requests[id];

        if (request) {
            if (err) {
                request.reject(isError(err) ? err : new Error(err.toString()));
            } else {
                request.resolve(payload);
            }

            delete requests[id];
        }
    }

    private __respond(
        path: string,
        id: string,
        err?: Error | string,
        payload?: any,
    ): void {
        const data = err ? null : payload;
        let error = err;

        if (isError(err)) {
            error = (err as Error).message;
        }

        this.__transport.send(
            `${this.__channel}:${RESPONSES}`,
            path,
            id,
            error,
            data,
        );
    }
}
