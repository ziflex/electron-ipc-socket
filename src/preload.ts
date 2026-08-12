import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import { ConnectionError, DisposedError, ProtocolError } from './errors.js';
import {
    assertName,
    channelNames,
    isConnectResponse,
    PROTOCOL_VERSION,
    serializeError,
    type BridgeNotification,
    type PreloadBridge,
} from './protocol.js';

export interface ExposeBridgeOptions {
    channel: string;
    key: string;
}

export interface PreloadBridgeController {
    readonly isConnected: boolean;
    dispose(): void;
}

type BridgeListener = (notification: BridgeNotification) => void;

class BridgeController implements PreloadBridgeController {
    private readonly listeners = new Set<BridgeListener>();
    private readonly names: ReturnType<typeof channelNames>;
    private readonly nonce = crypto.randomUUID();
    private port?: MessagePort;
    private disposed = false;
    private readonly handlePortMessage: (
        event: IpcRendererEvent,
        response: unknown,
    ) => void;
    private readonly handleMessage = (event: MessageEvent) => {
        this.notify({ data: event.data, type: 'message' });
    };
    private readonly handleMessageError = () => {
        this.notify({
            error: serializeError(
                new ProtocolError(
                    'The session port received an invalid message',
                ),
            ),
            type: 'error',
        });
    };
    private readonly handleClose = () => {
        this.detachPort(false);
    };

    readonly bridge: PreloadBridge;

    constructor(channel: string) {
        this.names = channelNames(channel);
        this.handlePortMessage = (event, response) => {
            this.acceptPort(event, response);
        };
        this.bridge = Object.freeze({
            close: () => this.dispose(),
            postMessage: (message: unknown) => this.postMessage(message),
            subscribe: (listener: BridgeListener) => this.subscribe(listener),
        });

        ipcRenderer.on(this.names.port, this.handlePortMessage);
        ipcRenderer.send(this.names.connect, {
            nonce: this.nonce,
            version: PROTOCOL_VERSION,
        });
    }

    get isConnected(): boolean {
        return this.port !== undefined && !this.disposed;
    }

    dispose(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        ipcRenderer.removeListener(this.names.port, this.handlePortMessage);
        this.detachPort(true);
        this.listeners.clear();
    }

    private acceptPort(event: IpcRendererEvent, response: unknown): void {
        if (this.disposed) {
            event.ports.forEach((port) => port.close());

            return;
        }

        if (
            !isConnectResponse(response, this.nonce) ||
            event.ports.length !== 1
        ) {
            event.ports.forEach((port) => port.close());
            this.notify({
                error: serializeError(
                    new ProtocolError('Invalid session port response'),
                ),
                type: 'error',
            });

            return;
        }

        this.detachPort(true);
        const port = event.ports[0]!;
        this.port = port;
        port.addEventListener('message', this.handleMessage);
        port.addEventListener('messageerror', this.handleMessageError);
        port.addEventListener('close', this.handleClose);
        port.start();
        this.notify({ connected: true, type: 'state' });
    }

    private postMessage(message: unknown): void {
        if (this.disposed) {
            throw new DisposedError();
        }

        if (!this.port) {
            throw new ConnectionError();
        }

        this.port.postMessage(message);
    }

    private subscribe(listener: BridgeListener): () => void {
        if (this.disposed) {
            throw new DisposedError();
        }

        this.listeners.add(listener);
        listener({ connected: this.isConnected, type: 'state' });

        return () => this.listeners.delete(listener);
    }

    private detachPort(close: boolean): void {
        const port = this.port;
        if (!port) {
            return;
        }

        this.port = undefined;
        port.removeEventListener('message', this.handleMessage);
        port.removeEventListener('messageerror', this.handleMessageError);
        port.removeEventListener('close', this.handleClose);
        if (close) {
            port.close();
        }
        if (!this.disposed) {
            this.notify({ connected: false, type: 'state' });
        }
    }

    private notify(notification: BridgeNotification): void {
        for (const listener of [...this.listeners]) {
            try {
                listener(notification);
            } catch {
                // Renderer observers cannot break the isolated preload controller.
            }
        }
    }
}

export function exposeBridge(
    options: ExposeBridgeOptions,
): PreloadBridgeController {
    assertName('key', options?.key);
    const controller = new BridgeController(options.channel);
    try {
        contextBridge.exposeInMainWorld(options.key, controller.bridge);
    } catch (error) {
        controller.dispose();
        throw error;
    }
    return controller;
}
