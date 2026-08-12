import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Procedure } from '../../src/contracts.js';
import {
    createRuntimeSessionValidation,
    defineContractValidation,
    validateValue,
    type ContractValidation,
    type StandardSchemaV1,
} from '../../src/validation.js';

type Contract = {
    main: {
        requests: { parse: Procedure<string, number> };
        events: { changed: boolean };
    };
    renderer: {
        requests: Record<never, never>;
        events: Record<never, never>;
    };
};

function pass<Output>(output: Output): StandardSchemaV1<unknown, Output> {
    return {
        '~standard': {
            validate: () => ({ value: output }),
            vendor: 'test',
            version: 1,
        },
    };
}

test('defines an immutable complete validation tree and snapshots routes', () => {
    const source: ContractValidation<Contract> = {
        main: {
            events: { changed: pass(true) },
            requests: {
                parse: { input: pass('parsed'), output: pass(1) },
            },
        },
        renderer: { events: {}, requests: {} },
    };
    const definition = defineContractValidation<Contract>(source);

    assert.notEqual(definition, source);
    assert.equal(Object.isFrozen(definition), true);
    assert.equal(Object.isFrozen(definition.main), true);
    assert.equal(Object.isFrozen(definition.main.requests), true);
    assert.equal(Object.isFrozen(definition.main.requests.parse), true);

    const runtime = createRuntimeSessionValidation(definition, 'main');
    assert.ok(runtime?.localRequests.has('parse'));
    assert.ok(runtime?.localEvents.has('changed'));
    assert.equal(runtime?.remoteRequestOutputs.size, 0);
});

test('rejects malformed schema definitions synchronously', () => {
    const malformed = {
        main: {
            events: { changed: { '~standard': { version: 2 } } },
            requests: {
                parse: { input: pass('parsed'), output: pass(1) },
            },
        },
        renderer: { events: {}, requests: {} },
    };

    assert.throws(
        () =>
            createRuntimeSessionValidation(
                malformed as unknown as ContractValidation<Contract>,
                'main',
            ),
        /Standard Schema V1/,
    );

    const missingOutput = {
        main: {
            events: { changed: pass(true) },
            requests: { parse: { input: pass('parsed') } },
        },
        renderer: { events: {}, requests: {} },
    };
    assert.throws(
        () =>
            createRuntimeSessionValidation(
                missingOutput as unknown as ContractValidation<Contract>,
                'main',
            ),
        /output must be a Standard Schema V1 schema/,
    );
});

test('normalizes malformed validator results into ValidationError', async () => {
    const malformed: StandardSchemaV1 = {
        '~standard': {
            validate: () => undefined as never,
            vendor: 'test',
            version: 1,
        },
    };

    await assert.rejects(
        validateValue(malformed, 'value', 'event', 'changed'),
        (error: unknown) =>
            error instanceof Error &&
            error.name === 'ValidationError' &&
            'code' in error &&
            error.code === 'ERR_IPC_VALIDATION' &&
            'cause' in error &&
            error.cause instanceof TypeError,
    );
});
