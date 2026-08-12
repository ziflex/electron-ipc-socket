import type {
    ContractConstraint,
    EndpointDefinition,
    IpcContract,
    Procedure,
} from './contracts.js';
import { ValidationError, type ValidationTarget } from './errors.js';
import { assertName } from './protocol.js';

/** The dependency-free structural interface implemented by Standard Schema V1 validators. */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
    readonly '~standard': {
        readonly version: 1;
        readonly vendor: string;
        readonly validate: (
            value: unknown,
        ) =>
            | StandardSchemaV1Result<Output>
            | Promise<StandardSchemaV1Result<Output>>;
        readonly types?: StandardSchemaV1Types<Input, Output>;
    };
}

export interface StandardSchemaV1Types<Input = unknown, Output = Input> {
    readonly input: Input;
    readonly output: Output;
}

export interface StandardSchemaV1PathSegment {
    readonly key: PropertyKey;
}

export interface StandardSchemaV1Issue {
    readonly message: string;
    readonly path?: readonly (PropertyKey | StandardSchemaV1PathSegment)[];
}

export interface StandardSchemaV1SuccessResult<Output> {
    readonly value: Output;
    readonly issues?: undefined;
}

export interface StandardSchemaV1FailureResult {
    readonly issues: readonly StandardSchemaV1Issue[];
}

export type StandardSchemaV1Result<Output> =
    StandardSchemaV1SuccessResult<Output> | StandardSchemaV1FailureResult;

type SchemaFor<Value> = StandardSchemaV1<unknown, Value>;

type RequestMap<Definition extends EndpointDefinition> = Definition['requests'];
type EventMap<Definition extends EndpointDefinition> = Definition['events'];

type InputOf<Value> =
    Value extends Procedure<infer Input, unknown> ? Input : never;

type OutputOf<Value> =
    Value extends Procedure<unknown, infer Output> ? Output : never;

type RequestValidation<Request> = {
    readonly input: SchemaFor<InputOf<Request>>;
    readonly output: SchemaFor<OutputOf<Request>>;
};

type EndpointValidation<Definition extends EndpointDefinition> = {
    readonly requests: {
        readonly [Route in keyof RequestMap<Definition>]: RequestValidation<
            RequestMap<Definition>[Route]
        >;
    };
    readonly events: {
        readonly [Route in keyof EventMap<Definition>]: SchemaFor<
            EventMap<Definition>[Route]
        >;
    };
};

/** A complete runtime schema tree for both receiving sides of a contract. */
export type ContractValidation<Contract extends IpcContract> = {
    readonly main: EndpointValidation<Contract['main']>;
    readonly renderer: EndpointValidation<Contract['renderer']>;
};

interface RuntimeRequestValidation {
    readonly input: StandardSchemaV1;
    readonly output: StandardSchemaV1;
}

interface RuntimeEndpointValidation {
    readonly events: ReadonlyMap<string, StandardSchemaV1>;
    readonly requests: ReadonlyMap<string, RuntimeRequestValidation>;
}

interface RuntimeContractValidation {
    readonly main: RuntimeEndpointValidation;
    readonly renderer: RuntimeEndpointValidation;
}

/** @internal */
export interface RuntimeSessionValidation {
    readonly localEvents: ReadonlyMap<string, StandardSchemaV1>;
    readonly localRequests: ReadonlyMap<string, RuntimeRequestValidation>;
    readonly remoteRequestOutputs: ReadonlyMap<string, StandardSchemaV1>;
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
    return typeof value === 'object' && value !== null;
}

function assertSchema(value: unknown, label: string): StandardSchemaV1 {
    if (!isRecord(value)) {
        throw new TypeError(`${label} must be a Standard Schema V1 schema`);
    }

    const standard = value['~standard'];
    if (
        !isRecord(standard) ||
        standard.version !== 1 ||
        typeof standard.vendor !== 'string' ||
        standard.vendor.length === 0 ||
        typeof standard.validate !== 'function'
    ) {
        throw new TypeError(`${label} must be a Standard Schema V1 schema`);
    }

    return value as unknown as StandardSchemaV1;
}

function ownStringEntries(value: unknown, label: string): [string, unknown][] {
    if (!isRecord(value)) {
        throw new TypeError(`${label} must be an object`);
    }

    if (Object.getOwnPropertySymbols(value).length > 0) {
        throw new TypeError(`${label} cannot contain symbol routes`);
    }

    return Object.entries(value);
}

function snapshotEndpoint(
    value: unknown,
    label: string,
): RuntimeEndpointValidation {
    if (!isRecord(value)) {
        throw new TypeError(`${label} must be an object`);
    }

    const requests = new Map<string, RuntimeRequestValidation>();
    for (const [route, request] of ownStringEntries(
        value.requests,
        `${label}.requests`,
    )) {
        assertName('request route', route);
        if (!isRecord(request)) {
            throw new TypeError(
                `${label}.requests.${route} must contain input and output schemas`,
            );
        }
        requests.set(
            route,
            Object.freeze({
                input: assertSchema(
                    request.input,
                    `${label}.requests.${route}.input`,
                ),
                output: assertSchema(
                    request.output,
                    `${label}.requests.${route}.output`,
                ),
            }),
        );
    }

    const events = new Map<string, StandardSchemaV1>();
    for (const [route, schema] of ownStringEntries(
        value.events,
        `${label}.events`,
    )) {
        assertName('event route', route);
        events.set(route, assertSchema(schema, `${label}.events.${route}`));
    }

    return Object.freeze({ events, requests });
}

function snapshotContract(value: unknown): RuntimeContractValidation {
    if (!isRecord(value)) {
        throw new TypeError('validation must be an object');
    }

    return Object.freeze({
        main: snapshotEndpoint(value.main, 'validation.main'),
        renderer: snapshotEndpoint(value.renderer, 'validation.renderer'),
    });
}

function freezeEndpointDefinition(value: Record<PropertyKey, unknown>): object {
    const requests = Object.fromEntries(
        Object.entries(value.requests as Record<string, unknown>).map(
            ([route, request]) => {
                const definition = request as Record<string, unknown>;
                return [
                    route,
                    Object.freeze({
                        input: definition.input,
                        output: definition.output,
                    }),
                ];
            },
        ),
    );
    const events = Object.fromEntries(
        Object.entries(value.events as Record<string, unknown>),
    );

    return Object.freeze({
        events: Object.freeze(events),
        requests: Object.freeze(requests),
    });
}

/** Validates and freezes a complete Standard Schema definition. */
export function defineContractValidation<Contract extends IpcContract>(
    validation: ContractValidation<Contract> & ContractConstraint<Contract>,
): ContractValidation<Contract> {
    snapshotContract(validation);

    const value = validation as unknown as Record<PropertyKey, unknown>;
    return Object.freeze({
        main: freezeEndpointDefinition(
            value.main as Record<PropertyKey, unknown>,
        ),
        renderer: freezeEndpointDefinition(
            value.renderer as Record<PropertyKey, unknown>,
        ),
    }) as ContractValidation<Contract>;
}

/** @internal */
export function createRuntimeSessionValidation<Contract extends IpcContract>(
    validation: ContractValidation<Contract> | undefined,
    localSide: 'main' | 'renderer',
): RuntimeSessionValidation | undefined {
    if (validation === undefined) {
        return undefined;
    }

    const contract = snapshotContract(validation);
    const local = contract[localSide];
    const remote = contract[localSide === 'main' ? 'renderer' : 'main'];

    return Object.freeze({
        localEvents: local.events,
        localRequests: local.requests,
        remoteRequestOutputs: new Map(
            [...remote.requests].map(([route, request]) => [
                route,
                request.output,
            ]),
        ),
    });
}

function isValidationResult(
    value: unknown,
): value is StandardSchemaV1Result<unknown> {
    return (
        isRecord(value) &&
        (('issues' in value &&
            Array.isArray(value.issues) &&
            value.issues.every(
                (issue) => isRecord(issue) && typeof issue.message === 'string',
            )) ||
            ('value' in value && value.issues === undefined))
    );
}

/** @internal */
export async function validateValue(
    schema: StandardSchemaV1,
    value: unknown,
    target: ValidationTarget,
    route: string,
): Promise<unknown> {
    let result: StandardSchemaV1Result<unknown>;

    try {
        const candidate = await schema['~standard'].validate(value);
        if (!isValidationResult(candidate)) {
            throw new TypeError(
                'Standard Schema validator returned an invalid result',
            );
        }
        result = candidate;
    } catch (error) {
        throw new ValidationError(target, route, [], error);
    }

    if (result.issues !== undefined) {
        throw new ValidationError(target, route, result.issues);
    }

    return result.value;
}
