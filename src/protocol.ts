import { ProtocolError, RemoteError, RpcError } from './errors.js';

export const PROTOCOL_VERSION = 1 as const;

export interface SerializedError {
    code?: string;
    message: string;
    name: string;
}

export interface ConnectRequest {
    nonce: string;
    version: typeof PROTOCOL_VERSION;
}

export type ConnectResponse = ConnectRequest;

export type WireMessage =
    | {
          id: string;
          kind: 'invoke';
          payload: unknown;
          route: string;
          version: typeof PROTOCOL_VERSION;
      }
    | {
          error?: SerializedError;
          id: string;
          kind: 'result';
          ok: boolean;
          payload?: unknown;
          version: typeof PROTOCOL_VERSION;
      }
    | {
          id: string;
          kind: 'cancel';
          version: typeof PROTOCOL_VERSION;
      }
    | {
          kind: 'event';
          payload: unknown;
          route: string;
          version: typeof PROTOCOL_VERSION;
      };

export interface BridgeMessageNotification {
    data: unknown;
    type: 'message';
}

export interface BridgeStateNotification {
    connected: boolean;
    type: 'state';
}

export interface BridgeErrorNotification {
    error: SerializedError;
    type: 'error';
}

export type BridgeNotification =
    | BridgeMessageNotification
    | BridgeStateNotification
    | BridgeErrorNotification;

export interface PreloadBridge {
    close(): void;
    postMessage(message: unknown): void;
    subscribe(listener: (notification: BridgeNotification) => void): () => void;
}

const MAX_NAME_LENGTH = 512;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isName(value: unknown): value is string {
    return (
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= MAX_NAME_LENGTH
    );
}

export function assertName(
    label: string,
    value: unknown,
): asserts value is string {
    if (!isName(value)) {
        throw new TypeError(
            `${label} must be a non-empty string no longer than ${MAX_NAME_LENGTH} characters`,
        );
    }
}

export function isConnectRequest(value: unknown): value is ConnectRequest {
    return (
        isRecord(value) &&
        value.version === PROTOCOL_VERSION &&
        isName(value.nonce)
    );
}

export function isConnectResponse(
    value: unknown,
    nonce: string,
): value is ConnectResponse {
    return isConnectRequest(value) && value.nonce === nonce;
}

function isSerializedError(value: unknown): value is SerializedError {
    return (
        isRecord(value) &&
        isName(value.name) &&
        typeof value.message === 'string' &&
        (value.code === undefined || isName(value.code))
    );
}

export function parseWireMessage(value: unknown): WireMessage {
    if (!isRecord(value) || value.version !== PROTOCOL_VERSION) {
        throw new ProtocolError('Unsupported or missing protocol version');
    }

    switch (value.kind) {
        case 'invoke':
            if (!isName(value.id) || !isName(value.route)) {
                throw new ProtocolError('Invalid invocation envelope');
            }

            return value as unknown as WireMessage;
        case 'result':
            if (!isName(value.id) || typeof value.ok !== 'boolean') {
                throw new ProtocolError('Invalid result envelope');
            }

            if (value.ok === false && !isSerializedError(value.error)) {
                throw new ProtocolError('Rejected result is missing an error');
            }

            return value as unknown as WireMessage;
        case 'cancel':
            if (!isName(value.id)) {
                throw new ProtocolError('Invalid cancellation envelope');
            }

            return value as unknown as WireMessage;
        case 'event':
            if (!isName(value.route)) {
                throw new ProtocolError('Invalid event envelope');
            }

            return value as unknown as WireMessage;
        default:
            throw new ProtocolError('Unknown protocol message kind');
    }
}

export function serializeError(reason: unknown): SerializedError {
    if (reason instanceof RpcError) {
        return {
            ...(isName(reason.code) ? { code: reason.code } : {}),
            message: reason.message,
            name: isName(reason.name) ? reason.name : 'RpcError',
        };
    }

    if (reason instanceof Error) {
        return {
            message: reason.message,
            name: isName(reason.name) ? reason.name : 'Error',
        };
    }

    return {
        message: typeof reason === 'string' ? reason : 'Remote handler failed',
        name: 'Error',
    };
}

export function deserializeError(error: SerializedError): RemoteError {
    return new RemoteError(error.name, error.message, error.code);
}

export function channelNames(channel: string): {
    connect: string;
    port: string;
} {
    assertName('channel', channel);

    const prefix = `__electron_ipc_socket__:${channel}`;

    return {
        connect: `${prefix}:connect`,
        port: `${prefix}:port`,
    };
}
