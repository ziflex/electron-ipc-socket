import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RequestContext, Subscription } from '../../src/contracts.js';
import { EndpointCore } from '../../src/endpoint.js';
import {
    AbortError,
    ConnectionError,
    DisposedError,
    ProtocolError,
    RemoteError,
    RpcError,
    TimeoutError,
    ValidationError,
} from '../../src/errors.js';
import { PROTOCOL_VERSION } from '../../src/protocol.js';
import {
    ReconnectableTransport,
    type Connection,
    type MessageListener,
    type TransportErrorListener,
} from '../../src/transport.js';
import type {
    RuntimeSessionValidation,
    StandardSchemaV1,
    StandardSchemaV1Result,
} from '../../src/validation.js';

class FakeConnection implements Connection {
    readonly sent: unknown[] = [];
    peer?: FakeConnection;
    private readonly closeListeners = new Set<() => void>();
    private readonly errorListeners = new Set<TransportErrorListener>();
    private readonly messageListeners = new Set<MessageListener>();
    private closed = false;

    postMessage(message: unknown): void {
        if (this.closed || !this.peer || this.peer.closed) {
            throw new ConnectionError();
        }

        const cloned = structuredClone(message);
        this.sent.push(cloned);
        queueMicrotask(() => {
            if (!this.closed && this.peer && !this.peer.closed) {
                this.peer.messageListeners.forEach((listener) =>
                    listener(cloned),
                );
            }
        });
    }

    subscribeMessage(listener: MessageListener): Subscription {
        this.messageListeners.add(listener);
        return () => this.messageListeners.delete(listener);
    }

    subscribeClose(listener: () => void): Subscription {
        this.closeListeners.add(listener);
        return () => this.closeListeners.delete(listener);
    }

    subscribeError(listener: TransportErrorListener): Subscription {
        this.errorListeners.add(listener);
        return () => this.errorListeners.delete(listener);
    }

    close(): void {
        if (this.closed) {
            return;
        }

        this.closed = true;
        this.closeListeners.forEach((listener) => listener());
        this.peer?.closeFromPeer();
    }

    emitError(error: Error): void {
        this.errorListeners.forEach((listener) => listener(error));
    }

    private closeFromPeer(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.closeListeners.forEach((listener) => listener());
    }
}

interface Pair {
    left: EndpointCore<RequestContext>;
    leftConnection: FakeConnection;
    leftTransport: ReconnectableTransport;
    right: EndpointCore<RequestContext>;
    rightConnection: FakeConnection;
    rightTransport: ReconnectableTransport;
}

function createConnections(): [FakeConnection, FakeConnection] {
    const left = new FakeConnection();
    const right = new FakeConnection();
    left.peer = right;
    right.peer = left;
    return [left, right];
}

function attach(
    left: ReconnectableTransport,
    right: ReconnectableTransport,
): [FakeConnection, FakeConnection] {
    const connections = createConnections();
    left.replace(connections[0]);
    right.replace(connections[1]);
    return connections;
}

function createPair(
    defaultTimeout: number | false = 1_000,
    validation: {
        left?: RuntimeSessionValidation;
        right?: RuntimeSessionValidation;
    } = {},
): Pair {
    const leftTransport = new ReconnectableTransport();
    const rightTransport = new ReconnectableTransport();
    const [leftConnection, rightConnection] = attach(
        leftTransport,
        rightTransport,
    );
    const createContext = (id: string, route: string, signal: AbortSignal) => ({
        id,
        route,
        signal,
    });
    return {
        left: new EndpointCore(
            leftTransport,
            createContext,
            defaultTimeout,
            validation.left,
        ),
        leftConnection,
        leftTransport,
        right: new EndpointCore(
            rightTransport,
            createContext,
            defaultTimeout,
            validation.right,
        ),
        rightConnection,
        rightTransport,
    };
}

function schema<Output>(
    validate: (
        value: unknown,
    ) =>
        | StandardSchemaV1Result<Output>
        | Promise<StandardSchemaV1Result<Output>>,
): StandardSchemaV1<unknown, Output> {
    return {
        '~standard': {
            validate,
            vendor: 'test',
            version: 1,
        },
    };
}

const passSchema = schema((value) => ({ value }));

function runtimeValidation({
    events = {},
    inputs = {},
    outputs = {},
}: {
    events?: Record<string, StandardSchemaV1>;
    inputs?: Record<string, StandardSchemaV1>;
    outputs?: Record<string, StandardSchemaV1>;
}): RuntimeSessionValidation {
    return {
        localEvents: new Map(Object.entries(events)),
        localRequests: new Map(
            Object.entries(inputs).map(([route, input]) => [
                route,
                { input, output: passSchema },
            ]),
        ),
        remoteRequestOutputs: new Map(Object.entries(outputs)),
    };
}

function deferred<Value>(): {
    promise: Promise<Value>;
    resolve(value: Value): void;
} {
    let resolve!: (value: Value) => void;
    const promise = new Promise<Value>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

test('supports bidirectional synchronous, asynchronous, and void requests', async (t) => {
    const pair = createPair();
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    pair.left.handle('sum', (payload) => {
        const values = payload as { a: number; b: number };
        return values.a + values.b;
    });
    pair.right.handle('greet', async (payload) => `hello ${String(payload)}`);
    pair.left.handle('ping', () => undefined);

    assert.equal(await pair.right.invoke('sum', { a: 2, b: 5 }, undefined), 7);
    assert.equal(
        await pair.left.invoke('greet', 'Ada', undefined),
        'hello Ada',
    );
    assert.equal(
        await pair.right.invoke('ping', undefined, undefined),
        undefined,
    );
});

test('validates and transforms received request inputs and results', async (t) => {
    const pair = createPair(1_000, {
        left: runtimeValidation({
            inputs: {
                sum: schema((value) => {
                    const input = value as { left?: unknown; right?: unknown };
                    if (
                        typeof input.left !== 'string' ||
                        typeof input.right !== 'string'
                    ) {
                        return { issues: [{ message: 'Expected strings' }] };
                    }

                    return {
                        value: {
                            left: Number(input.left),
                            right: Number(input.right),
                        },
                    };
                }),
            },
        }),
        right: runtimeValidation({
            outputs: {
                sum: schema(async (value) => ({
                    value: Number(value) * 2,
                })),
            },
        }),
    });
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    pair.left.handle('sum', (payload) => {
        const input = payload as { left: number; right: number };
        return input.left + input.right;
    });

    assert.equal(
        await pair.right.invoke('sum', { left: '2', right: '5' }, undefined),
        14,
    );
});

test('rejects invalid requests remotely without calling the handler', async (t) => {
    const pair = createPair(1_000, {
        left: runtimeValidation({
            inputs: {
                guarded: schema(() => ({
                    issues: [
                        { message: 'Rejected', path: ['secret', { key: 0 }] },
                    ],
                })),
            },
        }),
    });
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    let handled = false;
    const localErrors: Error[] = [];
    pair.left.onError((error) => localErrors.push(error));
    pair.left.handle('guarded', () => {
        handled = true;
    });

    await assert.rejects(
        pair.right.invoke('guarded', { secret: true }, undefined),
        (error: unknown) =>
            error instanceof RemoteError &&
            error.code === 'ERR_IPC_VALIDATION' &&
            error.remoteName === 'ValidationError' &&
            !('issues' in error),
    );
    assert.equal(handled, false);
    assert.equal(localErrors.length, 1);
    assert.ok(localErrors[0] instanceof ValidationError);
    assert.equal(
        (localErrors[0] as ValidationError).issues[0]?.message,
        'Rejected',
    );
});

test('rejects invalid results locally and normalizes thrown validators', async (t) => {
    const pair = createPair(1_000, {
        right: runtimeValidation({
            outputs: {
                invalid: schema(() => ({
                    issues: [{ message: 'Expected a number' }],
                })),
                throws: schema(() => {
                    throw new Error('validator internals');
                }),
            },
        }),
    });
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    pair.left.handle('invalid', () => 'wrong');
    pair.left.handle('throws', () => 'wrong');

    await assert.rejects(
        pair.right.invoke('invalid', undefined, undefined),
        (error: unknown) =>
            error instanceof ValidationError &&
            error.target === 'result' &&
            error.route === 'invalid' &&
            error.issues[0]?.message === 'Expected a number',
    );
    await assert.rejects(
        pair.right.invoke('throws', undefined, undefined),
        (error: unknown) =>
            error instanceof ValidationError &&
            error.target === 'result' &&
            error.issues.length === 0 &&
            error.cause instanceof Error &&
            error.cause.message === 'validator internals',
    );
});

test('preserves event order and leaves once listeners after invalid events', async (t) => {
    const pair = createPair(1_000, {
        left: runtimeValidation({
            events: {
                tick: schema(async (value) => {
                    const number = Number(value);
                    await new Promise((resolve) =>
                        setTimeout(resolve, number === 1 ? 10 : 0),
                    );
                    return number < 0
                        ? {
                              issues: [
                                  { message: 'Expected a positive number' },
                              ],
                          }
                        : { value: number };
                }),
            },
        }),
    });
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    const events: number[] = [];
    const once: number[] = [];
    const errors: Error[] = [];
    pair.left.on('tick', (value) => events.push(value as number));
    pair.left.once('tick', (value) => once.push(value as number));
    pair.left.onError((error) => errors.push(error));

    pair.right.send('tick', -1);
    pair.right.send('tick', 1);
    pair.right.send('tick', 2);
    await new Promise((resolve) => setTimeout(resolve, 30));

    assert.deepEqual(events, [1, 2]);
    assert.deepEqual(once, [1]);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof ValidationError);
});

test('cancels request validation and ignores stale validated events', async (t) => {
    const requestValidation = deferred<StandardSchemaV1Result<unknown>>();
    const eventValidation = deferred<StandardSchemaV1Result<unknown>>();
    const disposalValidation = deferred<StandardSchemaV1Result<unknown>>();
    const pair = createPair(false, {
        left: runtimeValidation({
            events: {
                delayed: schema((value) =>
                    value === 'dispose'
                        ? disposalValidation.promise
                        : eventValidation.promise,
                ),
            },
            inputs: {
                delayed: schema(() => requestValidation.promise),
            },
        }),
    });
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    let handled = false;
    let delivered = false;
    pair.left.handle('delayed', () => {
        handled = true;
    });
    pair.left.on('delayed', () => {
        delivered = true;
    });

    const controller = new AbortController();
    const invocation = pair.right.invoke('delayed', undefined, {
        signal: controller.signal,
    });
    pair.right.send('delayed', 'old');
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    pair.leftConnection.close();
    attach(pair.leftTransport, pair.rightTransport);
    requestValidation.resolve({ value: undefined });
    eventValidation.resolve({ value: 'old' });

    await assert.rejects(invocation, AbortError);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(handled, false);
    assert.equal(delivered, false);

    pair.right.send('delayed', 'new');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(delivered, true);

    delivered = false;
    pair.right.send('delayed', 'dispose');
    await new Promise((resolve) => setImmediate(resolve));
    pair.left.dispose();
    disposalValidation.resolve({ value: 'dispose' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(delivered, false);
});

test('keeps timeout and route enforcement active during validation', async (t) => {
    const resultValidation = deferred<StandardSchemaV1Result<unknown>>();
    const pair = createPair(5, {
        left: runtimeValidation({ inputs: { slow: passSchema } }),
        right: runtimeValidation({
            outputs: {
                slow: schema(() => resultValidation.promise),
            },
        }),
    });
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    pair.left.handle('slow', () => 'raw');
    await assert.rejects(
        pair.right.invoke('slow', undefined, undefined),
        TimeoutError,
    );
    resultValidation.resolve({ value: 'late' });
    await new Promise((resolve) => setImmediate(resolve));

    await assert.rejects(
        pair.right.invoke('undeclared', undefined, undefined),
        (error: unknown) =>
            error instanceof ProtocolError &&
            /not declared/.test(error.message),
    );

    const errors: Error[] = [];
    pair.left.onError((error) => errors.push(error));
    pair.right.send('undeclared', undefined);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(
        errors.some(
            (error) =>
                error instanceof ProtocolError &&
                /Event route/.test(error.message),
        ),
    );
});

test('delivers events with once and idempotent unsubscribe semantics', async (t) => {
    const pair = createPair();
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    const persistent: number[] = [];
    const once: number[] = [];
    const unsubscribe = pair.left.on('tick', (payload) => {
        persistent.push(payload as number);
    });
    pair.left.once('tick', (payload) => {
        once.push(payload as number);
    });

    pair.right.send('tick', 1);
    await new Promise((resolve) => setImmediate(resolve));
    unsubscribe();
    unsubscribe();
    pair.right.send('tick', 2);
    await new Promise((resolve) => setImmediate(resolve));

    assert.deepEqual(persistent, [1]);
    assert.deepEqual(once, [1]);
});

test('rejects duplicate handlers and unknown request routes', async (t) => {
    const pair = createPair();
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    pair.left.handle('known', () => 'ok');
    assert.throws(
        () => pair.left.handle('known', () => 'duplicate'),
        /already registered/,
    );

    await assert.rejects(
        pair.right.invoke('missing', undefined, undefined),
        (error: unknown) =>
            error instanceof RemoteError &&
            error.code === 'ERR_IPC_ROUTE_NOT_FOUND' &&
            error.remoteName === 'RpcError',
    );
});

test('reconstructs safe remote errors and handles non-Error throws', async (t) => {
    const pair = createPair();
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    pair.left.handle('coded', () => {
        throw new RpcError('ERR_EXAMPLE', 'safe failure');
    });
    pair.left.handle('plain', () => {
        throw new Error('plain failure');
    });
    pair.left.handle('string', () => {
        throw 'string failure';
    });

    await assert.rejects(
        pair.right.invoke('coded', undefined, undefined),
        (error: unknown) =>
            error instanceof RemoteError &&
            error.code === 'ERR_EXAMPLE' &&
            error.remoteName === 'RpcError' &&
            error.message === 'safe failure',
    );
    await assert.rejects(
        pair.right.invoke('plain', undefined, undefined),
        (error: unknown) =>
            error instanceof RemoteError &&
            error.remoteName === 'Error' &&
            error.message === 'plain failure',
    );
    await assert.rejects(
        pair.right.invoke('string', undefined, undefined),
        (error: unknown) =>
            error instanceof RemoteError && error.message === 'string failure',
    );

    const rejection = pair.leftConnection.sent.find(
        (message) =>
            typeof message === 'object' &&
            message !== null &&
            'kind' in message &&
            message.kind === 'result' &&
            'ok' in message &&
            message.ok === false,
    );
    assert.equal(JSON.stringify(rejection).includes('stack'), false);
});

test('times out and propagates cancellation to the remote handler', async (t) => {
    const pair = createPair(false);
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    let cancelled!: () => void;
    const cancellation = new Promise<void>((resolve) => {
        cancelled = resolve;
    });
    pair.left.handle('slow', (_payload, context) => {
        return new Promise<string>((resolve) => {
            context.signal.addEventListener(
                'abort',
                () => {
                    cancelled();
                    setTimeout(() => resolve('late'), 5);
                },
                { once: true },
            );
        });
    });

    await assert.rejects(
        pair.right.invoke('slow', undefined, { timeout: 5 }),
        TimeoutError,
    );
    await cancellation;
    await new Promise((resolve) => setTimeout(resolve, 10));

    pair.left.handle('fast', () => 'still connected');
    assert.equal(
        await pair.right.invoke('fast', undefined, { timeout: false }),
        'still connected',
    );
});

test('supports pre-aborted and mid-flight AbortSignals', async (t) => {
    const pair = createPair();
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    let calls = 0;
    pair.left.handle('abortable', (_payload, context) => {
        calls++;
        return new Promise<void>((resolve) => {
            context.signal.addEventListener('abort', () => resolve(), {
                once: true,
            });
        });
    });

    const preAborted = new AbortController();
    preAborted.abort();
    await assert.rejects(
        pair.right.invoke('abortable', undefined, {
            signal: preAborted.signal,
        }),
        AbortError,
    );
    assert.equal(calls, 0);

    const controller = new AbortController();
    const invocation = pair.right.invoke('abortable', undefined, {
        signal: controller.signal,
    });
    await new Promise((resolve) => setImmediate(resolve));
    controller.abort();
    await assert.rejects(invocation, AbortError);
    assert.equal(calls, 1);
});

test('reports malformed and version-mismatched envelopes without dispatching', async (t) => {
    const pair = createPair();
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    const errors: Error[] = [];
    pair.left.onError((error) => errors.push(error));
    pair.rightConnection.postMessage({ kind: 'event', version: 999 });
    pair.rightConnection.postMessage({
        kind: 'invoke',
        route: '',
        version: PROTOCOL_VERSION,
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(errors.length, 2);
    assert.ok(errors.every((error) => error instanceof ProtocolError));
});

test('rejects pending work on disconnect and reconnects without losing handlers', async (t) => {
    const pair = createPair(false);
    t.after(() => {
        pair.left.dispose();
        pair.right.dispose();
    });

    const states: boolean[] = [];
    pair.left.onStateChange((state) => states.push(state.connected));
    let handlerAborted = false;
    let calls = 0;
    pair.left.handle('retained', (_payload, context) => {
        calls++;
        if (calls > 1) {
            return 'retained after reconnect';
        }
        return new Promise<string>((resolve) => {
            context.signal.addEventListener(
                'abort',
                () => {
                    handlerAborted = true;
                    resolve('late');
                },
                { once: true },
            );
        });
    });

    const pending = pair.right.invoke('retained', undefined, {
        timeout: false,
    });
    await new Promise((resolve) => setImmediate(resolve));
    pair.leftConnection.close();
    await assert.rejects(pending, ConnectionError);
    assert.equal(handlerAborted, true);
    assert.equal(pair.left.isConnected, false);
    assert.throws(() => pair.left.send('lost', undefined), ConnectionError);

    const ready = pair.left.ready;
    const [leftConnection, rightConnection] = attach(
        pair.leftTransport,
        pair.rightTransport,
    );
    pair.leftConnection = leftConnection;
    pair.rightConnection = rightConnection;
    await ready;

    assert.equal(
        await pair.right.invoke('retained', undefined, { timeout: false }),
        'retained after reconnect',
    );
    assert.deepEqual(states, [true, false, true]);
    assert.equal(pair.left.isConnected, true);
});

test('dispose is idempotent and settles active invocations', async () => {
    const pair = createPair(false);
    pair.left.handle('never', () => new Promise(() => undefined));
    const pending = pair.right.invoke('never', undefined, { timeout: false });
    await new Promise((resolve) => setImmediate(resolve));

    pair.right.dispose();
    pair.right.dispose();
    await assert.rejects(pending, DisposedError);
    await assert.rejects(pair.right.ready, DisposedError);
    assert.equal(pair.right.isConnected, false);
    assert.throws(() => pair.right.on('event', () => undefined), DisposedError);

    pair.left.dispose();
});
