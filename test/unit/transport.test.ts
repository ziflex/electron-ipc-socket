/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { expect } from 'chai';
import sinon from 'sinon';
import { Transport } from '../../src/transport';
import { IPC } from '../mock/ipc';

describe('Transport', () => {
    describe('.on', () => {
        it('should subscribe event handler', () => {
            const handler = sinon.spy();
            const ipc = new IPC();
            const transport = new Transport(ipc);

            transport.on('event', handler);
            ipc.input.send('event', 'foo', 'bar');
            ipc.input.send('event', 'foo', 'bar');
            ipc.input.send('event2', 'foo', 'bar');

            expect(handler.callCount).to.equal(2);
            expect(handler.args[0][0]).to.eql(['foo', 'bar']);
        });

        context('When event not passed', () => {
            it('should throw an error', () => {
                const ipc = new IPC();
                const transport = new Transport(ipc);

                expect(() => {
                    (transport as any).on(null, sinon.spy());
                }).to.throw(Error);
            });
        });

        context('When handler not passed', () => {
            it('should throw an error', () => {
                const ipc = new IPC();
                const transport = new Transport(ipc);

                expect(() => {
                    (transport as any).on('event');
                }).to.throw(Error);
            });
        });

        context('When disposed', () => {
            it('should unsubscribe from input only registered handlers', () => {
                const handler = sinon.spy();
                const externalHandler = sinon.spy();
                const ipc = new IPC();
                const transport = new Transport(ipc);

                ipc.input.on('event', externalHandler);
                transport.on('event', handler);
                transport.dispose();
                ipc.input.send('event', 'foo', 'bar');

                expect(handler.callCount).to.equal(0);
                expect(externalHandler.callCount).to.equal(1);
            });
        });
    });

    describe('.once', () => {
        it('should subscribe event handler', () => {
            const handler = sinon.spy();
            const ipc = new IPC();
            const transport = new Transport(ipc);

            transport.on('event', handler, true);
            ipc.input.send('event', 'foo', 'bar');
            ipc.input.send('event', 'foo', 'bar');
            ipc.input.send('event2', 'foo', 'bar');

            expect(handler.callCount).to.equal(1);
            expect(handler.args[0][0]).to.eql(['foo', 'bar']);
        });

        context('When event not passed', () => {
            it('should throw an error', () => {
                const ipc = new IPC();
                const transport = new Transport(ipc);

                expect(() => {
                    (transport as any).on(null, sinon.spy(), true);
                }).to.throw(Error);
            });
        });

        context('When handler not passed', () => {
            it('should throw an error', () => {
                const ipc = new IPC();
                const transport = new Transport(ipc);

                expect(() => {
                    (transport as any).on('event', null, true);
                }).to.throw(Error);
            });
        });

        context('When disposed', () => {
            it('should unsubscribe from input only registered handlers', () => {
                const handler = sinon.spy();
                const externalHandler = sinon.spy();
                const ipc = new IPC();
                const transport = new Transport(ipc);

                ipc.input.once('event', externalHandler);
                transport.on('event', handler, true);
                transport.dispose();
                ipc.input.send('event', 'foo', 'bar');
                ipc.input.send('event', 'foo', 'bar');

                expect(handler.callCount).to.equal(0);
                expect(externalHandler.callCount).to.equal(1);
            });
        });
    });

    describe('.off', () => {
        it('should unsubscribe event handler', () => {
            const handler = sinon.spy();
            const ipc = new IPC();
            const transport = new Transport(ipc);

            const sub = transport.on('event', handler);
            ipc.input.send('event', 'foo', 'bar');

            expect(handler.callCount).to.equal(1);

            sub();
            ipc.input.send('event', 'foo', 'bar');

            expect(handler.callCount).to.equal(1);
        });

        it('should unsubscribe only registered event handler', () => {
            const handler = sinon.spy();
            const externalHandler = sinon.spy();
            const ipc = new IPC();
            const transport = new Transport(ipc);

            ipc.input.on('event', externalHandler);
            const sub = transport.on('event', handler);
            ipc.input.send('event', 'foo', 'bar');

            expect(handler.callCount).to.equal(1);

            sub();
            ipc.input.send('event', 'foo', 'bar');

            expect(handler.callCount).to.equal(1);
            expect(externalHandler.callCount).to.equal(2);
        });
    });

    describe('.send', () => {
        it('should send data', () => {
            const ipc = new IPC();
            const transport = new Transport(ipc);
            const handler = sinon.spy();

            ipc.output.on('event', handler);

            transport.send('event', 'foo', 'bar');

            expect(handler.callCount).to.equal(1);
            expect(handler.args[0][0]).to.eql('foo');
            expect(handler.args[0][1]).to.eql('bar');
        });
    });
});
