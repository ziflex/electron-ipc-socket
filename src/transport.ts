import { ConnectionError } from './errors.js';

export type MessageListener = (message: unknown) => void;
export type StateChangeListener = (connected: boolean) => void;
export type TransportErrorListener = (error: Error) => void;

export interface Connection {
    close(): void;
    postMessage(message: unknown): void;
    subscribeClose(listener: () => void): () => void;
    subscribeError(listener: TransportErrorListener): () => void;
    subscribeMessage(listener: MessageListener): () => void;
}

export interface SessionTransport {
    readonly isConnected: boolean;
    close(): void;
    postMessage(message: unknown): void;
    subscribeError(listener: TransportErrorListener): () => void;
    subscribeMessage(listener: MessageListener): () => void;
    subscribeState(listener: StateChangeListener): () => void;
}

export class ReconnectableTransport implements SessionTransport {
    private connection?: Connection;
    private connectionSubscriptions: Array<() => void> = [];
    private readonly errorListeners = new Set<TransportErrorListener>();
    private readonly messageListeners = new Set<MessageListener>();
    private readonly stateListeners = new Set<StateChangeListener>();
    private epoch = 0;
    private disposed = false;

    get isConnected(): boolean {
        return this.connection !== undefined;
    }

    replace(connection: Connection): void {
        if (this.disposed) {
            connection.close();
            return;
        }

        this.detach(true);
        const epoch = ++this.epoch;
        this.connection = connection;
        this.connectionSubscriptions = [
            connection.subscribeMessage((message) => {
                if (this.epoch === epoch) {
                    this.messageListeners.forEach((listener) =>
                        listener(message),
                    );
                }
            }),
            connection.subscribeError((error) => {
                if (this.epoch === epoch) {
                    this.errorListeners.forEach((listener) => listener(error));
                }
            }),
            connection.subscribeClose(() => {
                if (this.epoch === epoch) {
                    this.detach(false);
                }
            }),
        ];
        this.stateListeners.forEach((listener) => listener(true));
    }

    postMessage(message: unknown): void {
        if (!this.connection) {
            throw new ConnectionError();
        }

        this.connection.postMessage(message);
    }

    subscribeMessage(listener: MessageListener): () => void {
        this.messageListeners.add(listener);
        return () => this.messageListeners.delete(listener);
    }

    subscribeState(listener: StateChangeListener): () => void {
        this.stateListeners.add(listener);
        return () => this.stateListeners.delete(listener);
    }

    subscribeError(listener: TransportErrorListener): () => void {
        this.errorListeners.add(listener);
        return () => this.errorListeners.delete(listener);
    }

    close(): void {
        if (this.disposed) {
            return;
        }

        this.disposed = true;
        this.detach(true);
        this.messageListeners.clear();
        this.stateListeners.clear();
        this.errorListeners.clear();
    }

    private detach(closeConnection: boolean): void {
        const wasConnected = this.connection !== undefined;
        const connection = this.connection;

        this.connection = undefined;
        this.epoch++;
        this.connectionSubscriptions.splice(0).forEach((unsubscribe) => {
            unsubscribe();
        });

        if (closeConnection) {
            connection?.close();
        }

        if (wasConnected) {
            this.stateListeners.forEach((listener) => listener(false));
        }
    }
}
