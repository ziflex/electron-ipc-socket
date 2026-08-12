import {
    ipcMain,
    MessageChannelMain,
    type IpcMainEvent,
    type MessagePortMain,
    type WebContents,
    type WebFrameMain,
} from 'electron';

import type {
    ContractConstraint,
    EndpointSession,
    ErrorListener,
    EventListener,
    InvokeOptions,
    IpcContract,
    RequestContext,
    RequestHandler,
    StateListener,
    Subscription,
    ValidContract,
} from './contracts.js';
import { ConnectionError, ProtocolError } from './errors.js';
import { EndpointCore, type RuntimeRequestHandler } from './endpoint.js';
import {
    channelNames,
    isConnectRequest,
    PROTOCOL_VERSION,
} from './protocol.js';
import {
    ReconnectableTransport,
    type Connection,
    type MessageListener,
} from './transport.js';
import {
    createRuntimeSessionValidation,
    type ContractValidation,
} from './validation.js';

export interface MainAuthorizationContext {
    readonly channel: string;
    readonly frame: WebFrameMain;
    readonly origin: string;
    readonly url: string;
    readonly webContents: WebContents;
}

export interface MainRequestContext extends RequestContext {
    readonly frame: WebFrameMain;
    readonly origin: string;
    readonly url: string;
    readonly webContents: WebContents;
}

export interface CreateMainSessionOptions<
    Contract extends IpcContract = IpcContract,
> {
    authorize(context: MainAuthorizationContext): boolean;
    channel: string;
    defaultTimeout?: number | false;
    validation?: ContractValidation<Contract>;
    webContents: WebContents;
}

export type MainSession<Contract extends IpcContract> = [Contract] extends [
    ValidContract<Contract>,
]
    ? EndpointSession<
          Contract['main'],
          Contract['renderer'],
          MainRequestContext
      >
    : never;

const ACTIVE_CHANNELS = Symbol.for(
    'electron-ipc-socket.main-active-channels.v4',
);
const globalRegistry = globalThis as Record<PropertyKey, unknown>;
const existingChannels = globalRegistry[ACTIVE_CHANNELS];
if (existingChannels !== undefined && !(existingChannels instanceof WeakMap)) {
    throw new TypeError('The global main-session registry is invalid');
}
const activeChannels =
    existingChannels instanceof WeakMap
        ? (existingChannels as WeakMap<WebContents, Set<string>>)
        : new WeakMap<WebContents, Set<string>>();

if (existingChannels === undefined) {
    Object.defineProperty(globalRegistry, ACTIVE_CHANNELS, {
        configurable: false,
        enumerable: false,
        value: activeChannels,
        writable: false,
    });
}

class MainPortConnection implements Connection {
    constructor(private readonly port: MessagePortMain) {}

    postMessage(message: unknown): void {
        this.port.postMessage(message);
    }

    subscribeMessage(listener: MessageListener): Subscription {
        const portListener = (event: Electron.MessageEvent) => {
            listener(event.data);
        };
        this.port.on('message', portListener);

        return () => this.port.off('message', portListener);
    }

    subscribeClose(listener: () => void): Subscription {
        this.port.on('close', listener);

        return () => this.port.off('close', listener);
    }

    subscribeError(): Subscription {
        return () => undefined;
    }

    close(): void {
        this.port.close();
    }

    start(): void {
        this.port.start();
    }
}

class MainSessionImpl {
    private authorization?: MainAuthorizationContext;
    private disposed = false;
    private readonly core: EndpointCore<MainRequestContext>;
    private readonly names: ReturnType<typeof channelNames>;
    private readonly transport = new ReconnectableTransport();
    private readonly handleConnect: (
        event: IpcMainEvent,
        request: unknown,
    ) => void;
    private readonly handleDestroyed: () => void;

    constructor(
        private readonly options: CreateMainSessionOptions,
        private readonly releaseChannel: Subscription,
    ) {
        this.names = channelNames(options.channel);
        this.core = new EndpointCore(
            this.transport,
            (id, route, signal) => {
                const authorization = this.authorization;
                if (!authorization) {
                    throw new ConnectionError();
                }

                return {
                    frame: authorization.frame,
                    id,
                    origin: authorization.origin,
                    route,
                    signal,
                    url: authorization.url,
                    webContents: authorization.webContents,
                };
            },
            options.defaultTimeout,
            createRuntimeSessionValidation(options.validation, 'main'),
        );
        this.handleConnect = (event, request) => {
            this.acceptConnection(event, request);
        };
        this.handleDestroyed = () => this.dispose();

        ipcMain.on(this.names.connect, this.handleConnect);
        options.webContents.once('destroyed', this.handleDestroyed);
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
        handler: RequestHandler<unknown, unknown, MainRequestContext>,
    ): Subscription {
        return this.core.handle(
            route,
            handler as RuntimeRequestHandler<MainRequestContext>,
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
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        ipcMain.removeListener(this.names.connect, this.handleConnect);

        if (!this.options.webContents.isDestroyed()) {
            this.options.webContents.removeListener(
                'destroyed',
                this.handleDestroyed,
            );
        }

        this.core.dispose();
        this.releaseChannel();
    }

    private acceptConnection(event: IpcMainEvent, request: unknown): void {
        if (this.disposed) {
            return;
        }

        if (!isConnectRequest(request)) {
            this.core.notifyError(
                new ProtocolError('Invalid connection request'),
            );

            return;
        }

        const frame = event.senderFrame;
        if (!this.isValidSender(event.sender, frame)) {
            this.core.notifyError(
                new ProtocolError(
                    'Connection request came from an invalid frame',
                ),
            );

            return;
        }

        const authorization: MainAuthorizationContext = {
            channel: this.options.channel,
            frame,
            origin: frame.origin,
            url: frame.url,
            webContents: event.sender,
        };

        let allowed: boolean;

        try {
            const decision = this.options.authorize(authorization);
            if (typeof decision !== 'boolean') {
                throw new TypeError(
                    'authorize must return a boolean synchronously',
                );
            }

            allowed = decision;
        } catch (error) {
            this.core.notifyError(
                error instanceof Error
                    ? error
                    : new ProtocolError('Authorization failed'),
            );

            return;
        }

        if (!allowed || !this.isValidSender(event.sender, frame)) {
            this.core.notifyError(
                new ProtocolError('Connection request was not authorized'),
            );

            return;
        }

        if (
            frame.url !== authorization.url ||
            frame.origin !== authorization.origin
        ) {
            this.core.notifyError(
                new ProtocolError(
                    'Connection frame changed during authorization',
                ),
            );

            return;
        }

        const { port1, port2 } = new MessageChannelMain();
        const connection = new MainPortConnection(port1);

        try {
            frame.postMessage(
                this.names.port,
                {
                    nonce: request.nonce,
                    version: PROTOCOL_VERSION,
                },
                [port2],
            );
            this.authorization = authorization;
            this.transport.replace(connection);
            connection.start();
        } catch (error) {
            connection.close();
            port2.close();
            this.core.notifyError(
                error instanceof Error
                    ? error
                    : new ConnectionError(
                          'Could not transfer the session port',
                      ),
            );
        }
    }

    private isValidSender(
        sender: WebContents,
        frame: WebFrameMain | null,
    ): frame is WebFrameMain {
        return (
            sender === this.options.webContents &&
            !sender.isDestroyed() &&
            frame !== null &&
            !frame.isDestroyed() &&
            !frame.detached &&
            frame === sender.mainFrame
        );
    }
}

export function createMainSession<Contract extends IpcContract>(
    options: CreateMainSessionOptions<Contract> & ContractConstraint<Contract>,
): MainSession<Contract> {
    if (typeof options?.authorize !== 'function') {
        throw new TypeError('authorize is required');
    }
    if (!options.webContents || options.webContents.isDestroyed()) {
        throw new TypeError('webContents must be a live WebContents instance');
    }

    const channels =
        activeChannels.get(options.webContents) ?? new Set<string>();

    if (channels.has(options.channel)) {
        throw new TypeError(
            `A main session already exists for channel "${options.channel}"`,
        );
    }

    channels.add(options.channel);
    activeChannels.set(options.webContents, channels);

    let released = false;
    const releaseChannel = () => {
        if (released) {
            return;
        }

        released = true;
        channels.delete(options.channel);

        if (channels.size === 0) {
            activeChannels.delete(options.webContents);
        }
    };

    try {
        return new MainSessionImpl(
            options,
            releaseChannel,
        ) as unknown as MainSession<Contract>;
    } catch (error) {
        releaseChannel();

        throw error;
    }
}
