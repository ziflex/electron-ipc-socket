import type {
    ErrorListener,
    EventListener,
    InvokeOptions,
    RequestContext,
    SessionState,
    StateListener,
    Subscription,
} from './contracts.js';
import {
    AbortError,
    ConnectionError,
    DisposedError,
    ProtocolError,
    RpcError,
    TimeoutError,
} from './errors.js';
import {
    assertName,
    deserializeError,
    parseWireMessage,
    PROTOCOL_VERSION,
    serializeError,
    type WireMessage,
} from './protocol.js';
import type { SessionTransport } from './transport.js';

export const DEFAULT_INVOCATION_TIMEOUT = 60_000;

export type RuntimeRequestHandler<Context extends RequestContext> = (
    payload: unknown,
    context: Context,
) => unknown | Promise<unknown>;

interface PendingInvocation {
    abortListener?: () => void;
    reject: (reason: Error) => void;
    resolve: (value: unknown) => void;
    signal?: AbortSignal;
    timer?: ReturnType<typeof setTimeout>;
}

interface ReadyDeferred {
    promise: Promise<void>;
    reject: (reason: Error) => void;
    resolve: () => void;
}

export class EndpointCore<Context extends RequestContext> {
    private readonly activeHandlers = new Map<string, AbortController>();
    private readonly errorListeners = new Set<ErrorListener>();
    private readonly eventListeners = new Map<
        string,
        Set<EventListener<unknown>>
    >();
    private readonly handlers = new Map<
        string,
        RuntimeRequestHandler<Context>
    >();
    private readonly pendingInvocations = new Map<string, PendingInvocation>();
    private readonly stateListeners = new Set<StateListener>();
    private readonly transportSubscriptions: Subscription[];
    private readyDeferred: ReadyDeferred;
    private connected: boolean;
    private disposed = false;

    constructor(
        private readonly transport: SessionTransport,
        private readonly createContext: (
            id: string,
            route: string,
            signal: AbortSignal,
        ) => Context,
        private readonly defaultTimeout:
            number | false = DEFAULT_INVOCATION_TIMEOUT,
    ) {
        this.validateTimeout(defaultTimeout);
        this.connected = transport.isConnected;
        this.readyDeferred = this.createReadyDeferred();

        if (this.connected) {
            this.readyDeferred.resolve();
        }

        this.transportSubscriptions = [
            transport.subscribeMessage((message) => this.receive(message)),
            transport.subscribeState((connected) =>
                this.handleStateChange(connected),
            ),
            transport.subscribeError((error) => this.notifyError(error)),
        ];
    }

    get isConnected(): boolean {
        return !this.disposed && this.connected;
    }

    get ready(): Promise<void> {
        if (this.disposed) {
            return Promise.reject(new DisposedError());
        }

        return this.readyDeferred.promise;
    }

    invoke(
        route: string,
        payload: unknown,
        options: InvokeOptions | undefined,
    ): Promise<unknown> {
        assertName('route', route);
        if (this.disposed) {
            return Promise.reject(new DisposedError());
        }

        if (!this.connected) {
            return Promise.reject(new ConnectionError());
        }

        if (options?.signal?.aborted) {
            return Promise.reject(new AbortError());
        }

        let timeout: number | false;

        try {
            timeout = this.validateTimeout(
                options?.timeout ?? this.defaultTimeout,
            );
        } catch (error) {
            return Promise.reject(error);
        }

        const id = crypto.randomUUID();

        return new Promise<unknown>((resolve, reject) => {
            const pending: PendingInvocation = {
                reject,
                resolve,
                signal: options?.signal,
            };

            if (timeout !== false) {
                pending.timer = setTimeout(() => {
                    this.cancelPending(id, new TimeoutError(timeout), true);
                }, timeout);
            }

            if (pending.signal) {
                pending.abortListener = () => {
                    this.cancelPending(id, new AbortError(), true);
                };
                pending.signal.addEventListener(
                    'abort',
                    pending.abortListener,
                    { once: true },
                );
            }

            this.pendingInvocations.set(id, pending);

            try {
                this.transport.postMessage({
                    id,
                    kind: 'invoke',
                    payload,
                    route,
                    version: PROTOCOL_VERSION,
                } satisfies WireMessage);
            } catch (error) {
                this.finishPending(
                    id,
                    'reject',
                    error instanceof Error ? error : new ConnectionError(),
                );
            }
        });
    }

    handle(
        route: string,
        handler: RuntimeRequestHandler<Context>,
    ): Subscription {
        assertName('route', route);
        this.assertUsable();

        if (this.handlers.has(route)) {
            throw new TypeError(
                `A handler is already registered for "${route}"`,
            );
        }

        this.handlers.set(route, handler);
        let subscribed = true;

        return () => {
            if (subscribed && this.handlers.get(route) === handler) {
                subscribed = false;
                this.handlers.delete(route);
            }
        };
    }

    send(route: string, payload: unknown): void {
        assertName('event', route);
        this.assertUsable();

        if (!this.connected) {
            throw new ConnectionError();
        }

        this.transport.postMessage({
            kind: 'event',
            payload,
            route,
            version: PROTOCOL_VERSION,
        } satisfies WireMessage);
    }

    on(route: string, listener: EventListener<unknown>): Subscription {
        assertName('event', route);
        this.assertUsable();

        let listeners = this.eventListeners.get(route);
        if (!listeners) {
            listeners = new Set();
            this.eventListeners.set(route, listeners);
        }

        listeners.add(listener);
        let subscribed = true;

        return () => {
            if (!subscribed) {
                return;
            }

            subscribed = false;
            listeners?.delete(listener);

            if (listeners?.size === 0) {
                this.eventListeners.delete(route);
            }
        };
    }

    once(route: string, listener: EventListener<unknown>): Subscription {
        let unsubscribe: Subscription = () => undefined;

        unsubscribe = this.on(route, (payload) => {
            unsubscribe();
            listener(payload);
        });

        return unsubscribe;
    }

    onStateChange(listener: StateListener): Subscription {
        this.assertUsable();
        this.stateListeners.add(listener);
        try {
            listener({ connected: this.connected });
        } catch (error) {
            this.stateListeners.delete(listener);
            this.notifyError(
                error instanceof Error
                    ? error
                    : new Error('State listener failed'),
            );
        }

        return () => this.stateListeners.delete(listener);
    }

    onError(listener: ErrorListener): Subscription {
        this.assertUsable();
        this.errorListeners.add(listener);

        return () => this.errorListeners.delete(listener);
    }

    notifyError(error: Error): void {
        for (const listener of [...this.errorListeners]) {
            try {
                listener(error);
            } catch {
                // Error observers must not break transport dispatch.
            }
        }
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        const reason = new DisposedError();
        this.rejectPending(reason);
        this.abortHandlers(reason);
        this.readyDeferred.reject(reason);
        this.transport.close();
        this.transportSubscriptions.splice(0).forEach((unsubscribe) => {
            unsubscribe();
        });
        this.handlers.clear();
        this.eventListeners.clear();
        this.stateListeners.clear();
        this.errorListeners.clear();
    }

    private receive(value: unknown): void {
        if (this.disposed) {
            return;
        }

        let message: WireMessage;

        try {
            message = parseWireMessage(value);
        } catch (error) {
            this.notifyError(
                error instanceof Error
                    ? error
                    : new ProtocolError('Invalid protocol message'),
            );
            return;
        }

        switch (message.kind) {
            case 'invoke':
                this.receiveInvocation(message);
                break;
            case 'result':
                if (message.ok) {
                    this.finishPending(message.id, 'resolve', message.payload);
                } else {
                    this.finishPending(
                        message.id,
                        'reject',
                        deserializeError(message.error!),
                    );
                }
                break;
            case 'cancel':
                this.activeHandlers
                    .get(message.id)
                    ?.abort(
                        new AbortError('Remote caller cancelled the request'),
                    );
                break;
            case 'event':
                this.receiveEvent(message.route, message.payload);
                break;
        }
    }

    private receiveInvocation(
        message: Extract<WireMessage, { kind: 'invoke' }>,
    ): void {
        const handler = this.handlers.get(message.route);
        if (!handler) {
            this.sendFailure(
                message.id,
                new RpcError(
                    'ERR_IPC_ROUTE_NOT_FOUND',
                    `No handler is registered for "${message.route}"`,
                ),
            );
            return;
        }

        if (this.activeHandlers.has(message.id)) {
            this.sendFailure(
                message.id,
                new RpcError(
                    'ERR_IPC_DUPLICATE_REQUEST',
                    `Request "${message.id}" is already active`,
                ),
            );
            return;
        }

        const controller = new AbortController();
        this.activeHandlers.set(message.id, controller);
        let context: Context;
        try {
            context = this.createContext(
                message.id,
                message.route,
                controller.signal,
            );
        } catch (error) {
            this.activeHandlers.delete(message.id);
            this.sendFailure(message.id, error);
            return;
        }

        void Promise.resolve()
            .then(() => handler(message.payload, context))
            .then((payload) => {
                if (!controller.signal.aborted && this.connected) {
                    this.transport.postMessage({
                        id: message.id,
                        kind: 'result',
                        ok: true,
                        payload,
                        version: PROTOCOL_VERSION,
                    } satisfies WireMessage);
                }
            })
            .catch((error: unknown) => {
                if (!controller.signal.aborted && this.connected) {
                    this.sendFailure(message.id, error);
                }
            })
            .finally(() => {
                if (this.activeHandlers.get(message.id) === controller) {
                    this.activeHandlers.delete(message.id);
                }
            });
    }

    private receiveEvent(route: string, payload: unknown): void {
        const listeners = [...(this.eventListeners.get(route) ?? [])];
        for (const listener of listeners) {
            try {
                const result = (listener as (eventPayload: unknown) => unknown)(
                    payload,
                );
                if (
                    typeof result === 'object' &&
                    result !== null &&
                    'then' in result &&
                    typeof result.then === 'function'
                ) {
                    void Promise.resolve(result).catch((error: unknown) => {
                        this.notifyError(
                            error instanceof Error
                                ? error
                                : new Error('Event listener failed'),
                        );
                    });
                }
            } catch (error) {
                this.notifyError(
                    error instanceof Error
                        ? error
                        : new Error('Event listener failed'),
                );
            }
        }
    }

    private sendFailure(id: string, reason: unknown): void {
        try {
            this.transport.postMessage({
                error: serializeError(reason),
                id,
                kind: 'result',
                ok: false,
                version: PROTOCOL_VERSION,
            } satisfies WireMessage);
        } catch (error) {
            this.notifyError(
                error instanceof Error ? error : new ConnectionError(),
            );
        }
    }

    private cancelPending(
        id: string,
        reason: Error,
        notifyRemote: boolean,
    ): void {
        if (!this.pendingInvocations.has(id)) {
            return;
        }

        if (notifyRemote && this.connected) {
            try {
                this.transport.postMessage({
                    id,
                    kind: 'cancel',
                    version: PROTOCOL_VERSION,
                } satisfies WireMessage);
            } catch {
                // The local rejection is authoritative if the port races closed.
            }
        }

        this.finishPending(id, 'reject', reason);
    }

    private finishPending(
        id: string,
        outcome: 'reject' | 'resolve',
        value: unknown,
    ): void {
        const pending = this.pendingInvocations.get(id);
        if (!pending) {
            return;
        }

        this.pendingInvocations.delete(id);
        if (pending.timer) {
            clearTimeout(pending.timer);
        }
        if (pending.signal && pending.abortListener) {
            pending.signal.removeEventListener('abort', pending.abortListener);
        }

        if (outcome === 'resolve') {
            pending.resolve(value);
        } else {
            pending.reject(value as Error);
        }
    }

    private handleStateChange(connected: boolean): void {
        if (this.connected === connected) {
            return;
        }

        this.connected = connected;
        if (connected) {
            this.readyDeferred.resolve();
        } else {
            const reason = new ConnectionError('IPC session disconnected');
            this.rejectPending(reason);
            this.abortHandlers(reason);
            if (!this.disposed) {
                this.readyDeferred = this.createReadyDeferred();
            }
        }

        const state: SessionState = { connected };
        for (const listener of [...this.stateListeners]) {
            try {
                listener(state);
            } catch (error) {
                this.notifyError(
                    error instanceof Error
                        ? error
                        : new Error('State listener failed'),
                );
            }
        }
    }

    private rejectPending(reason: Error): void {
        for (const id of [...this.pendingInvocations.keys()]) {
            this.finishPending(id, 'reject', reason);
        }
    }

    private abortHandlers(reason: Error): void {
        for (const controller of this.activeHandlers.values()) {
            controller.abort(reason);
        }
        this.activeHandlers.clear();
    }

    private assertUsable(): void {
        if (this.disposed) {
            throw new DisposedError();
        }
    }

    private validateTimeout(timeout: number | false): number | false {
        if (timeout !== false && (!Number.isFinite(timeout) || timeout < 0)) {
            throw new TypeError(
                'Invocation timeout must be false or a non-negative number',
            );
        }

        return timeout;
    }

    private createReadyDeferred(): ReadyDeferred {
        let resolve!: () => void;
        let reject!: (reason: Error) => void;
        const promise = new Promise<void>((resolvePromise, rejectPromise) => {
            resolve = resolvePromise;
            reject = rejectPromise;
        });
        void promise.catch(() => undefined);
        return { promise, reject, resolve };
    }
}
