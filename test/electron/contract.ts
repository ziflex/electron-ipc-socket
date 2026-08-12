import {
    defineContractValidation,
    type Procedure,
    type StandardSchemaV1,
    type StandardSchemaV1FailureResult,
    type StandardSchemaV1Result,
} from 'electron-ipc-socket';

export interface RendererReport {
    addResult: number;
    cancellationObserved: boolean;
    errorCode: string;
    eventCount: number;
    invalidEventCount: number;
    invalidRequestCode: string;
    ok: boolean;
    run: number;
    validationErrorCount: number;
    validatedValue: string;
}

export type FixtureContract = {
    main: {
        requests: {
            'fixture:add': Procedure<{ left: number; right: number }, number>;
            'fixture:cancel': Procedure<{ run: number }, void>;
            'fixture:cancel-seen': Procedure<{ run: number }, boolean>;
            'fixture:fail': Procedure<void, void>;
            'fixture:ready': Procedure<{ run: number }, void>;
            'fixture:report': Procedure<RendererReport, void>;
            'fixture:validate': Procedure<{ value: string }, string>;
        };
        events: {
            'fixture:renderer-event': { run: number };
        };
    };
    renderer: {
        requests: {
            'fixture:cancel-renderer': Procedure<{ run: number }, void>;
            'fixture:invalid-result': Procedure<void, number>;
            'fixture:uppercase': Procedure<string, string>;
        };
        events: {
            'fixture:invalid-event': { run: number };
            'fixture:main-event': { run: number };
        };
    };
};

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
            vendor: 'electron-fixture',
            version: 1,
        },
    };
}

function issue(message: string): StandardSchemaV1FailureResult {
    return { issues: [{ message }] };
}

const voidSchema = schema((value) =>
    value === undefined ? { value: undefined } : issue('Expected undefined'),
);
const stringSchema = schema((value) =>
    typeof value === 'string' ? { value } : issue('Expected a string'),
);
const numberSchema = schema((value) =>
    typeof value === 'number' ? { value } : issue('Expected a number'),
);
const booleanSchema = schema((value) =>
    typeof value === 'boolean' ? { value } : issue('Expected a boolean'),
);
const runSchema = schema((value) =>
    typeof value === 'object' &&
    value !== null &&
    'run' in value &&
    typeof value.run === 'number'
        ? { value: { run: value.run } }
        : issue('Expected a numeric run'),
);
const addSchema = schema(async (value) => {
    await Promise.resolve();
    return typeof value === 'object' &&
        value !== null &&
        'left' in value &&
        typeof value.left === 'number' &&
        'right' in value &&
        typeof value.right === 'number'
        ? { value: { left: value.left, right: value.right } }
        : issue('Expected numeric operands');
});
const validateSchema = schema((value) =>
    typeof value === 'object' &&
    value !== null &&
    'value' in value &&
    typeof value.value === 'string'
        ? { value: { value: value.value.trim() } }
        : issue('Expected a string value'),
);
const reportSchema = schema((value) => {
    if (typeof value !== 'object' || value === null) {
        return issue('Expected a report');
    }

    const report = value as Partial<RendererReport>;
    return typeof report.addResult === 'number' &&
        typeof report.cancellationObserved === 'boolean' &&
        typeof report.errorCode === 'string' &&
        typeof report.eventCount === 'number' &&
        typeof report.invalidEventCount === 'number' &&
        typeof report.invalidRequestCode === 'string' &&
        typeof report.ok === 'boolean' &&
        typeof report.run === 'number' &&
        typeof report.validationErrorCount === 'number' &&
        typeof report.validatedValue === 'string'
        ? { value: report as RendererReport }
        : issue('Invalid report fields');
});

export const validation = defineContractValidation<FixtureContract>({
    main: {
        events: {
            'fixture:renderer-event': runSchema,
        },
        requests: {
            'fixture:add': { input: addSchema, output: numberSchema },
            'fixture:cancel': { input: runSchema, output: voidSchema },
            'fixture:cancel-seen': {
                input: runSchema,
                output: booleanSchema,
            },
            'fixture:fail': { input: voidSchema, output: voidSchema },
            'fixture:ready': { input: runSchema, output: voidSchema },
            'fixture:report': { input: reportSchema, output: voidSchema },
            'fixture:validate': {
                input: validateSchema,
                output: stringSchema,
            },
        },
    },
    renderer: {
        events: {
            'fixture:invalid-event': runSchema,
            'fixture:main-event': runSchema,
        },
        requests: {
            'fixture:cancel-renderer': {
                input: runSchema,
                output: voidSchema,
            },
            'fixture:invalid-result': {
                input: voidSchema,
                output: numberSchema,
            },
            'fixture:uppercase': {
                input: stringSchema,
                output: stringSchema,
            },
        },
    },
});
