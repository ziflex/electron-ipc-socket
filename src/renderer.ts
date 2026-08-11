import type {
    EndpointSession,
    ErrorListener,
    EventListener,
    InvokeOptions,
    IpcContract,
    RequestContext,
    RequestHandler,
    StateListener,
    Subscription,
} from './contracts.js';
import { ConnectionError } from './errors.js';
import { EndpointCore, type RuntimeRequestHandler } from './endpoint.js';
import {
    deserializeError,
    type BridgeNotification,
    type PreloadBridge,
} from './protocol.js';
import type {
    MessageListener,
    SessionTransport,
    StateChangeListener,
    TransportErrorListener,
} from './transport.js';

export interface CreateRendererSessionOptions {
    defaultTimeout?: number | false;
}

export type RendererSession<Contract extends IpcContract> = EndpointSession<
    Contract['renderer'],
    Contract['main'],
    RequestContext
>;

class BridgeTransport implements SessionTransport {
    private readonly errorListeners = new Set<TransportErrorListener>();
    private readonly messageListeners = new Set<MessageListener>();
    private readonly stateListeners = new Set<StateChangeListener>();
    private unsubscribeBridge?: () => void;
    private connected = false;
    private disposed = false;

    constructor(private readonly bridge: PreloadBridge) {
        this.unsubscribeBridge = bridge.subscribe((notification) => {
            this.receive(notification);
        });
    }

    get isConnected(): boolean {
        return this.connected && !this.disposed;
    }

    postMessage(message: unknown): void {
        if (!this.isConnected) {
            throw new ConnectionError();
        }
        this.bridge.postMessage(message);
    }

    subscribeMessage(listener: MessageListener): Subscription {
        this.messageListeners.add(listener);
        return () => this.messageListeners.delete(listener);
    }

    subscribeState(listener: StateChangeListener): Subscription {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }

    subscribeError(listener: TransportErrorListener): Subscription {
        this.errorListeners.add(listener);
        return () => this.errorListeners.delete(listener);
    }

    close(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.unsubscribeBridge?.();
        this.unsubscribeBridge = undefined;
        try {
            this.bridge.close();
        } finally {
            if (this.connected) {
                this.connected = false;
                this.stateListeners.forEach((listener) => listener(false));
            }
            this.messageListeners.clear();
            this.stateListeners.clear();
            this.errorListeners.clear();
        }
    }

    private receive(notification: BridgeNotification): void {
        if (this.disposed) {
            return;
        }

        switch (notification.type) {
            case 'message':
                this.messageListeners.forEach((listener) =>
                    listener(notification.data),
                );
                break;
            case 'state':
                if (this.connected !== notification.connected) {
                    this.connected = notification.connected;
                    this.stateListeners.forEach((listener) =>
                        listener(notification.connected),
                    );
                }
                break;
            case 'error':
                this.errorListeners.forEach((listener) =>
                    listener(deserializeError(notification.error)),
                );
                break;
        }
    }
}

class RendererSessionImpl {
    private readonly core: EndpointCore<RequestContext>;

    constructor(bridge: PreloadBridge, options: CreateRendererSessionOptions) {
        this.core = new EndpointCore(
            new BridgeTransport(bridge),
            (id, route, signal) => ({ id, route, signal }),
            options.defaultTimeout,
        );
    }

    get isConnected(): boolean {
        return this.core.isConnected;
    }

    get ready(): Promise<void> {
        return this.core.ready;
    }

    invoke(
        route: string,
        payload?: unknown,
        options?: InvokeOptions,
    ): Promise<unknown> {
        return this.core.invoke(route, payload, options);
    }

    handle(
        route: string,
        handler: RequestHandler<unknown, unknown, RequestContext>,
    ): Subscription {
        return this.core.handle(
            route,
            handler as RuntimeRequestHandler<RequestContext>,
        );
    }

    send(route: string, payload?: unknown): void {
        this.core.send(route, payload);
    }

    on(route: string, listener: EventListener<unknown>): Subscription {
        return this.core.on(route, listener);
    }

    once(route: string, listener: EventListener<unknown>): Subscription {
        return this.core.once(route, listener);
    }

    onStateChange(listener: StateListener): Subscription {
        return this.core.onStateChange(listener);
    }

    onError(listener: ErrorListener): Subscription {
        return this.core.onError(listener);
    }

    dispose(): void {
        this.core.dispose();
    }
}

export function createRendererSession<Contract extends IpcContract>(
    bridge: PreloadBridge,
    options: CreateRendererSessionOptions = {},
): RendererSession<Contract> {
    if (
        !bridge ||
        typeof bridge.postMessage !== 'function' ||
        typeof bridge.subscribe !== 'function' ||
        typeof bridge.close !== 'function'
    ) {
        throw new TypeError('bridge must be created by exposeBridge');
    }

    return new RendererSessionImpl(
        bridge,
        options,
    ) as unknown as RendererSession<Contract>;
}
