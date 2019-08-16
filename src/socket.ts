import isError from 'is-error';
import isPromise = require('is-promise');
import NanoEvents from 'nanoevents';
import unbindAll from 'nanoevents/unbind-all';
import { Interval } from 'pinterval';
import { Disposable } from './core/disposable';
import { Subscription } from './core/observable';
import { ConnectionLostError } from './errors/connection';
import { UnhandledExceptionError } from './errors/exception';
import { NotFoundError } from './errors/not-found';
import { RequiredError } from './errors/required';
import { SocketClosedError, SocketOpenError } from './errors/socket';
import { TimeoutError } from './errors/timeout';
import { Event } from './event';
import { InboundRequest } from './inbound-request';
import { OutboundRequest } from './outbound-request';
import { Transport, TransportInput, TransportOutput } from './transport';
import { assert, requires } from './utils/assertions';

const REQUESTS = 'requests';
const RESPONSES = 'responses';
const EVENTS = 'events';
const BUS_EVENTS = Math.random().toString();
const BUS_REQUESTS = Math.random().toString();

export type RequestHandler<T = any> = (req: InboundRequest) => T;
export type AsyncRequestHandler<T = any> = (req: InboundRequest) => Promise<T>;
export type EventHandler<T = any> = (evt: Event<T>) => void;

export interface Settings {
    timeout?: number;
    cleanup?: number;
}

export class Socket extends Disposable {
    private __isOpen: boolean;
    private __channel: string;
    private __transport: Transport;
    private __bus: NanoEvents<any>;
    private __interval: Interval;
    private __requestTimeout: number;
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
        this.__interval = new Interval({
            func: this.__cleanup.bind(this),
            time: settings.cleanup || 1000 * 60,
        });
        this.__bus = new NanoEvents();
    }

    public get isOpen(): boolean {
        return this.__isOpen;
    }

    public dispose(): void {
        super.dispose();

        this.__bus.emit('dispose', new Event('dispose'));

        if (this.isOpen) {
            this.close();
        }

        this.__transport.dispose();
        unbindAll(this.__bus);

        delete this.__transport;
        delete this.__interval;
        delete this.__pendingRequests;
        delete this.__bus;
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

        this.__bus.emit('open', new Event('open'));
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

        this.__bus.emit('close', new Event('close'));
    }

    public send(event: string, payload?: any): void {
        Disposable.assert(this);
        assert(SocketClosedError, this.__isOpen);
        requires('event', event);

        this.__transport.send(`${this.__channel}:${EVENTS}`, event, payload);
    }

    public async request<T = any>(path: string, payload?: any): Promise<T> {
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

                    this.__bus.emit('error', new Event('error', e));
                }
            }
        });
    }

    public onEvent(
        name: string,
        handler: EventHandler,
        once: boolean = false,
    ): Subscription {
        return this.__subscribe(`${BUS_EVENTS}/${name}`, handler, once);
    }

    public onRequest(
        path: string,
        handler: RequestHandler | AsyncRequestHandler,
        once: boolean = false,
    ): Subscription {
        return this.__subscribe(
            `${BUS_REQUESTS}/${path}`,
            this.__responder.bind(this, handler),
            once,
        );
    }

    public onError(
        handler: EventHandler<Error>,
        once: boolean = false,
    ): Subscription {
        return this.__subscribe('error', handler, once);
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
        const [name, payload] = data;

        try {
            this.__bus.emit(`${BUS_EVENTS}/${name}`, new Event(name, payload));
        } catch (e) {
            this.__bus.emit('error', new Event('error', e));
        }
    }

    private __handleRequest(data: any[]): void {
        const [path, id, payload] = data;
        const req = new InboundRequest(path, payload);

        const evt = `${BUS_REQUESTS}/${path}`;

        if (this.__hasHandler(evt)) {
            this.__bus.emit(evt, [id, req]);
        } else {
            this.__sendResponse(path, id, new NotFoundError(path));
        }
    }

    private __handleResponse(data: any[]): void {
        const requests = this.__pendingRequests;

        if (requests == null) {
            return;
        }

        const [_, id, err, payload] = data;
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

    private __responder(
        handler: RequestHandler | AsyncRequestHandler,
        data: any[],
    ): void {
        const [id, req] = data;

        try {
            const out = handler(req);

            if (!isPromise(out)) {
                if (!isError(out)) {
                    return this.__sendResponse(req.path, id, undefined, out);
                }

                return this.__sendResponse(req.path, id, out);
            }

            (out as Promise<any>)
                .then(data =>
                    this.__sendResponse(req.path, id, undefined, data),
                )
                .catch(reason => this.__sendResponse(req.path, id, reason));
        } catch (e) {
            this.__sendResponse(req.path, id, new UnhandledExceptionError(e));
        }
    }

    private __sendResponse(
        path: string,
        id: string,
        err?: string | Error,
        payload?: any,
    ): void {
        const data = err ? null : payload;
        let error = err;

        if (isError(err)) {
            error = (err as Error).message;

            setTimeout(() => {
                this.__bus.emit('error', new Event('error', err));
            });
        }

        this.__transport.send(
            `${this.__channel}:${RESPONSES}`,
            path,
            id,
            error,
            data,
        );
    }

    private __hasHandler(event: string): boolean {
        const handlers = (this.__bus as any).events[event];

        return handlers != null && handlers.length > 0;
    }

    private __subscribe(
        event: string,
        listener: any,
        once: boolean,
    ): Subscription {
        if (!once) {
            return this.__bus.on(event, listener);
        }

        let unbind: Subscription | undefined = this.__bus.on(
            event,
            (args: any) => {
                if (unbind != null) {
                    listener(args);
                    unbind();
                    unbind = undefined;
                }
            },
        );

        return () => {
            if (unbind != null) {
                unbind();
            }
        };
    }
}
