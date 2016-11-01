/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { expect } from 'chai';
import sinon from 'sinon';
import { Transport, isTransport } from '../../src/transport';
import IPC from '../mock/ipc';

describe('Transport', () => {
    describe('#constructor', () => {
        context('When arguments are missed', () => {
            it('should throw an error', () => {
                expect(() => {
                    return Transport();
                }).to.throw(Error);
            });
        });

        context('When arguments are invalid', () => {
            it('should throw an error', () => {
                expect(() => {
                    return Transport({});
                }).to.throw(Error);

                expect(() => {
                    return Transport({
                        once: sinon.spy(),
                        removeListener: sinon.spy(),
                        removeAllListeners: sinon.spy()
                    });
                }).to.throw(Error);

                expect(() => {
                    return Transport({
                        on: sinon.spy(),
                        removeListener: sinon.spy(),
                        removeAllListeners: sinon.spy()
                    });
                }).to.throw(Error);

                expect(() => {
                    return Transport({
                        on: sinon.spy(),
                        once: sinon.spy(),
                        removeAllListeners: sinon.spy()
                    });
                }).to.throw(Error);

                expect(() => {
                    return Transport({
                        on: sinon.spy(),
                        once: sinon.spy(),
                        removeListener: sinon.spy()
                    });
                }).to.throw(Error);

                expect(() => {
                    return Transport({
                        on: sinon.spy(),
                        once: sinon.spy(),
                        removeListener: sinon.spy(),
                        removeAllListeners: sinon.spy()
                    });
                }).to.throw(Error);

                expect(() => {
                    return Transport({
                        on: sinon.spy(),
                        once: sinon.spy(),
                        removeListener: sinon.spy(),
                        removeAllListeners: sinon.spy()
                    }, {});
                }).to.throw(Error);
            });
        });
    });

    describe('.on', () => {
        it('should subscribe event handler', () => {
            const handler = sinon.spy();
            const ipc = IPC();
            const transport = Transport(ipc);

            transport.on('event', handler);
            ipc.input.emit('event', 'foo', 'bar');
            ipc.input.emit('event', 'foo', 'bar');
            ipc.input.emit('event2', 'foo', 'bar');

            expect(handler.callCount).to.equal(2);
            expect(handler.args[0][0]).to.eql('foo');
            expect(handler.args[0][1]).to.eql('bar');
        });

        context('When event not passed', () => {
            it('should throw an error', () => {
                const ipc = IPC();
                const transport = Transport(ipc);

                expect(() => {
                    transport.on(null, sinon.spy());
                }).to.throw(Error);
            });
        });

        context('When handler not passed', () => {
            it('should throw an error', () => {
                const ipc = IPC();
                const transport = Transport(ipc);

                expect(() => {
                    transport.on('event');
                }).to.throw(Error);
            });
        });

        context('When disposed', () => {
            it('should unsubscribe from input only registered handlers', () => {
                const handler = sinon.spy();
                const externalHandler = sinon.spy();
                const ipc = IPC();
                const transport = Transport(ipc);

                ipc.input.on('event', externalHandler);
                transport.on('event', handler);
                transport.dispose();
                ipc.input.emit('event', 'foo', 'bar');

                expect(handler.callCount).to.equal(0);
                expect(externalHandler.callCount).to.equal(1);
            });
        });
    });

    describe('.once', () => {
        it('should subscribe event handler', () => {
            const handler = sinon.spy();
            const ipc = IPC();
            const transport = Transport(ipc);

            transport.once('event', handler);
            ipc.input.emit('event', 'foo', 'bar');
            ipc.input.emit('event', 'foo', 'bar');
            ipc.input.emit('event2', 'foo', 'bar');

            expect(handler.callCount).to.equal(1);
            expect(handler.args[0][0]).to.eql('foo');
            expect(handler.args[0][1]).to.eql('bar');
        });

        context('When event not passed', () => {
            it('should throw an error', () => {
                const ipc = IPC();
                const transport = Transport(ipc);

                expect(() => {
                    transport.once(null, sinon.spy());
                }).to.throw(Error);
            });
        });

        context('When handler not passed', () => {
            it('should throw an error', () => {
                const ipc = IPC();
                const transport = Transport(ipc);

                expect(() => {
                    transport.once('event');
                }).to.throw(Error);
            });
        });

        context('When disposed', () => {
            it('should unsubscribe from input only registered handlers', () => {
                const handler = sinon.spy();
                const externalHandler = sinon.spy();
                const ipc = IPC();
                const transport = Transport(ipc);

                ipc.input.once('event', externalHandler);
                transport.once('event', handler);
                transport.dispose();
                ipc.input.emit('event', 'foo', 'bar');
                ipc.input.emit('event', 'foo', 'bar');

                expect(handler.callCount).to.equal(0);
                expect(externalHandler.callCount).to.equal(1);
            });
        });
    });

    describe('.off', () => {
        it('should unsubscribe event handler', () => {
            const handler = sinon.spy();
            const ipc = IPC();
            const transport = Transport(ipc);

            transport.on('event', handler);
            ipc.input.emit('event', 'foo', 'bar');

            expect(handler.callCount).to.equal(1);

            transport.off('event', handler);
            ipc.input.emit('event', 'foo', 'bar');

            expect(handler.callCount).to.equal(1);
        });

        it('should unsubscribe only registered event handler', () => {
            const handler = sinon.spy();
            const externalHandler = sinon.spy();
            const ipc = IPC();
            const transport = Transport(ipc);

            ipc.input.on('event', externalHandler);
            transport.on('event', handler);
            ipc.input.emit('event', 'foo', 'bar');

            expect(handler.callCount).to.equal(1);

            transport.off('event', handler);
            ipc.input.emit('event', 'foo', 'bar');

            expect(handler.callCount).to.equal(1);
            expect(externalHandler.callCount).to.equal(2);
        });

        it('should ignore not registered handlers', () => {
            const externalHandler = sinon.spy();
            const ipc = IPC();
            const transport = Transport(ipc);

            ipc.input.on('event', externalHandler);

            transport.off('event', externalHandler);
            ipc.input.emit('event', 'foo', 'bar');

            expect(externalHandler.callCount).to.equal(1);
        });

        context('When handler not passed', () => {
            it('should unsubscribe all registered handlers from given event', () => {
                const handler1 = sinon.spy();
                const handler2 = sinon.spy();

                const ipc = IPC();
                const transport = Transport(ipc);

                transport.on('event', handler1);
                transport.on('event', handler2);
                ipc.input.emit('event', 'foo', 'bar');

                expect(handler1.callCount).to.equal(1);
                expect(handler2.callCount).to.equal(1);

                transport.off('event');
                ipc.input.emit('event', 'foo', 'bar');

                expect(handler1.callCount).to.equal(1);
                expect(handler2.callCount).to.equal(1);
            });

            it('should ignore not registered handlers', () => {
                const handler = sinon.spy();
                const externalHandler = sinon.spy();
                const ipc = IPC();
                const transport = Transport(ipc);

                ipc.input.on('event', externalHandler);
                transport.on('event', handler);

                ipc.input.emit('event', 'foo', 'bar');

                expect(handler.callCount).to.equal(1);
                expect(externalHandler.callCount).to.equal(1);

                transport.off('event');
                ipc.input.emit('event', 'foo', 'bar');

                expect(handler.callCount).to.equal(1);
                expect(externalHandler.callCount).to.equal(2);
            });
        });
    });

    describe('.removeAllListeners', () => {
        it('should remove all registered listeners', () => {
            const handler1 = sinon.spy();
            const handler2 = sinon.spy();
            const handler3 = sinon.spy();
            const handler4 = sinon.spy();
            const externalHandler1 = sinon.spy();
            const externalHandler2 = sinon.spy();
            const externalHandler3 = sinon.spy();
            const externalHandler4 = sinon.spy();
            const ipc = IPC();
            const transport = Transport(ipc);

            ipc.input.on('event1', externalHandler1);
            ipc.input.on('event2', externalHandler2);
            ipc.input.on('event3', externalHandler3);
            ipc.input.on('event3', externalHandler4);

            transport.on('event1', handler1);
            transport.on('event2', handler2);
            transport.on('event3', handler3);
            transport.on('event3', handler4);

            ipc.input.emit('event1', 'foo', 'bar');
            ipc.input.emit('event2', 'foo', 'bar');
            ipc.input.emit('event3', 'foo', 'bar');

            expect(handler1.callCount).to.equal(1);
            expect(handler2.callCount).to.equal(1);
            expect(handler3.callCount).to.equal(1);
            expect(handler4.callCount).to.equal(1);

            expect(externalHandler1.callCount).to.equal(1);
            expect(externalHandler2.callCount).to.equal(1);
            expect(externalHandler3.callCount).to.equal(1);
            expect(externalHandler4.callCount).to.equal(1);

            transport.removeAllListeners();

            ipc.input.emit('event1', 'foo', 'bar');
            ipc.input.emit('event2', 'foo', 'bar');
            ipc.input.emit('event3', 'foo', 'bar');

            expect(handler1.callCount).to.equal(1);
            expect(handler2.callCount).to.equal(1);
            expect(handler3.callCount).to.equal(1);
            expect(handler4.callCount).to.equal(1);

            expect(externalHandler1.callCount).to.equal(2);
            expect(externalHandler2.callCount).to.equal(2);
            expect(externalHandler3.callCount).to.equal(2);
            expect(externalHandler4.callCount).to.equal(2);
        });
    });

    describe('.send', () => {
        it('should send data', () => {
            const ipc = IPC();
            const transport = Transport(ipc);
            const handler = sinon.spy();

            ipc.output.on('event', handler);

            transport.send('event', 'foo', 'bar');

            expect(handler.callCount).to.equal(1);
            expect(handler.args[0][0]).to.eql('foo');
            expect(handler.args[0][1]).to.eql('bar');
        });
    });
});

describe('isTransport', () => {
    it('should define wheather a given object is a transport instance', () => {
        expect(isTransport(Transport(IPC()))).to.be.true;
        expect(isTransport({})).to.be.false;
        expect(isTransport()).to.be.false;
        expect(isTransport(1)).to.be.false;
    });
});
