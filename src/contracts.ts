export type Procedure<Input = void, Output = void> = {
    input: Input;
    output: Output;
};

export interface EndpointDefinition {
    requests: object;
    events: object;
}

export interface IpcContract {
    main: EndpointDefinition;
    renderer: EndpointDefinition;
}

export type AppContract = IpcContract;

export type Subscription = () => void;

export interface InvokeOptions {
    signal?: AbortSignal;
    timeout?: number | false;
}

export interface RequestContext {
    readonly id: string;
    readonly route: string;
    readonly signal: AbortSignal;
}

export interface SessionState {
    readonly connected: boolean;
}

type RequestMap<Definition extends EndpointDefinition> = Definition['requests'];
type EventMap<Definition extends EndpointDefinition> = Definition['events'];

type RequestKeys<Definition extends EndpointDefinition> = Extract<
    keyof RequestMap<Definition>,
    string
>;

type EventKeys<Definition extends EndpointDefinition> = Extract<
    keyof EventMap<Definition>,
    string
>;

type InputOf<Value> =
    Value extends Procedure<infer Input, unknown> ? Input : never;

type OutputOf<Value> =
    Value extends Procedure<unknown, infer Output> ? Output : never;

type InvokeArguments<Input> = [Input] extends [void]
    ? [payload?: Input, options?: InvokeOptions]
    : [payload: Input, options?: InvokeOptions];

type EventArguments<Payload> = [Payload] extends [void]
    ? [payload?: Payload]
    : [payload: Payload];

export type RequestHandler<Input, Output, Context extends RequestContext> = (
    payload: Input,
    context: Context,
) => Output | Promise<Output>;

export type EventListener<Payload> = (payload: Payload) => void;
export type StateListener = (state: SessionState) => void;
export type ErrorListener = (error: Error) => void;

export interface EndpointSession<
    Local extends EndpointDefinition,
    Remote extends EndpointDefinition,
    Context extends RequestContext = RequestContext,
> {
    readonly isConnected: boolean;
    readonly ready: Promise<void>;

    invoke<Route extends RequestKeys<Remote>>(
        route: Route,
        ...args: InvokeArguments<InputOf<RequestMap<Remote>[Route]>>
    ): Promise<OutputOf<RequestMap<Remote>[Route]>>;

    handle<Route extends RequestKeys<Local>>(
        route: Route,
        handler: RequestHandler<
            InputOf<RequestMap<Local>[Route]>,
            OutputOf<RequestMap<Local>[Route]>,
            Context
        >,
    ): Subscription;

    send<Event extends EventKeys<Remote>>(
        event: Event,
        ...args: EventArguments<EventMap<Remote>[Event]>
    ): void;

    on<Event extends EventKeys<Local>>(
        event: Event,
        listener: EventListener<EventMap<Local>[Event]>,
    ): Subscription;

    once<Event extends EventKeys<Local>>(
        event: Event,
        listener: EventListener<EventMap<Local>[Event]>,
    ): Subscription;

    onStateChange(listener: StateListener): Subscription;
    onError(listener: ErrorListener): Subscription;
    dispose(): void;
}
