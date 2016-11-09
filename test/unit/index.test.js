/* eslint-disable global-require, no-unused-expressions, import/no-extraneous-dependencies */
import { expect } from 'chai';

describe('index', () => {
    it('should export types as commonjs module', () => {
        const IPC = require('../../src/index.js');

        expect(typeof IPC.Transport === 'function').to.be.true;
        expect(typeof IPC.Socket === 'function').to.be.true;
    });
});
