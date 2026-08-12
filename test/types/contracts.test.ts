import {
    defineContractValidation,
    type ContractValidation,
    type PreloadBridge,
    type Procedure,
    type StandardSchemaV1,
} from '../../src/index.js';
import {
    createMainSession,
    type CreateMainSessionOptions,
    type MainSession,
} from '../../src/main.js';
import {
    createRendererSession,
    type RendererSession,
} from '../../src/renderer.js';

type Contract = {
    main: {
        requests: {
            add: Procedure<{ left: number; right: number }, number>;
            ping: Procedure<void, string>;
        };
        events: {
            changed: { value: number };
        };
    };
    renderer: {
        requests: {
            confirm: Procedure<string, boolean>;
        };
        events: {
            notice: string;
            ready: void;
        };
    };
};

declare const main: MainSession<Contract>;
declare const renderer: RendererSession<Contract>;

void main.invoke('confirm', 'continue');
void renderer.invoke('add', { left: 1, right: 2 });
void renderer.invoke('ping');
main.send('notice', 'hello');
main.send('ready');
renderer.send('changed', { value: 1 });
main.handle('add', ({ left, right }) => left + right);
renderer.handle('confirm', async (message) => message.length > 0);

declare const unknownSchema: StandardSchemaV1<unknown, unknown>;
declare const voidSchema: StandardSchemaV1<unknown, void>;
declare const stringSchema: StandardSchemaV1<unknown, string>;
declare const booleanSchema: StandardSchemaV1<unknown, boolean>;
declare const numberSchema: StandardSchemaV1<unknown, number>;
declare const additionSchema: StandardSchemaV1<
    unknown,
    { left: number; right: number }
>;
declare const changedSchema: StandardSchemaV1<unknown, { value: number }>;

const validation = defineContractValidation<Contract>({
    main: {
        events: { changed: changedSchema },
        requests: {
            add: { input: additionSchema, output: numberSchema },
            ping: { input: voidSchema, output: stringSchema },
        },
    },
    renderer: {
        events: { notice: stringSchema, ready: voidSchema },
        requests: {
            confirm: { input: stringSchema, output: booleanSchema },
        },
    },
});

const checkedValidation: ContractValidation<Contract> = validation;
void checkedValidation;

interface InterfaceRequests {
    lookup: Procedure<string, number>;
}

interface InterfaceEvents {
    loaded: boolean;
}

interface InterfaceContract {
    main: {
        requests: InterfaceRequests;
        events: InterfaceEvents;
    };
    renderer: {
        requests: Record<never, never>;
        events: Record<never, never>;
    };
}

declare const interfaceMain: MainSession<InterfaceContract>;
interfaceMain.handle('lookup', (value) => value.length);

// @ts-expect-error Renderer requests are not callable from the renderer.
void renderer.invoke('confirm', 'continue');
// @ts-expect-error Main requests are not callable from the main process.
void main.invoke('add', { left: 1, right: 2 });
// @ts-expect-error Unknown request route.
void renderer.invoke('missing', undefined);
// @ts-expect-error Wrong request payload.
void renderer.invoke('add', { left: '1', right: 2 });
// @ts-expect-error Missing non-void payload.
void renderer.invoke('add');
// @ts-expect-error Wrong event payload.
main.send('notice', 42);
// @ts-expect-error Wrong handler result.
main.handle('add', () => 'not a number');
// @ts-expect-error Wrong handler direction.
main.handle('confirm', () => true);

type InvalidProcedureContract = {
    main: {
        requests: { invalid: string };
        events: Record<never, never>;
    };
    renderer: {
        requests: Record<never, never>;
        events: Record<never, never>;
    };
};

declare const invalidMain: MainSession<InvalidProcedureContract>;
// @ts-expect-error Invalid request entries make the session unusable.
invalidMain.dispose();

declare const invalidMainOptions: CreateMainSessionOptions<InvalidProcedureContract>;
// @ts-expect-error A malformed contract cannot create a main session.
createMainSession<InvalidProcedureContract>(invalidMainOptions);

declare const bridge: PreloadBridge;
// @ts-expect-error A malformed contract cannot create a renderer session.
createRendererSession<InvalidProcedureContract>(bridge);

type NumericRouteContract = {
    main: {
        requests: { 1: Procedure<void, void> };
        events: Record<never, never>;
    };
    renderer: {
        requests: Record<never, never>;
        events: Record<never, never>;
    };
};

declare const numericMain: MainSession<NumericRouteContract>;
// @ts-expect-error Contract route keys must be strings.
numericMain.dispose();

defineContractValidation<Contract>({
    main: {
        events: { changed: changedSchema },
        // @ts-expect-error Complete validation requires every declared route.
        requests: {
            add: { input: additionSchema, output: numberSchema },
        },
    },
    renderer: {
        events: { notice: stringSchema, ready: voidSchema },
        requests: {
            confirm: { input: stringSchema, output: booleanSchema },
        },
    },
});

defineContractValidation<Contract>({
    main: {
        events: { changed: changedSchema },
        requests: {
            add: {
                input: additionSchema,
                // @ts-expect-error Schema output must match the Procedure output.
                output: stringSchema,
            },
            ping: { input: voidSchema, output: stringSchema },
        },
    },
    renderer: {
        events: {
            notice: stringSchema,
            ready: voidSchema,
            // @ts-expect-error Undeclared validation routes are rejected.
            unexpected: unknownSchema,
        },
        requests: {
            confirm: { input: stringSchema, output: booleanSchema },
        },
    },
});
