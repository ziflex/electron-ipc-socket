/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { expect } from 'chai';
import sinon from 'sinon';
import { UnhandledExceptionError } from '../../src/errors/exception';
import { TimeoutError } from '../../src/errors/timeout';
import { InboundRequest } from '../../src/inbound-request';
import { Socket } from '../../src/socket';
import { Transport } from '../../src/transport';
import { IPC } from '../mock/ipc';
import { create as createWebview } from '../mock/webview';

async function sleep(time: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, time));
}

describe('Socket', () => {
    let s1: Socket;
    let s2: Socket;

    beforeEach(() => {
        const ipc = new IPC();

        s1 = new Socket('user-channel', new Transport(ipc.input, ipc.output));
        s2 = new Socket('user-channel', new Transport(ipc.output, ipc.input));
    });

    describe('.open', () => {
        it('should subscribe to event via transport', () => {
            const ipc = new IPC();
            const on = sinon.spy(ipc, 'on');
            const socket = new Socket('test_channel', ipc);

            socket.open();

            expect(on.callCount).to.eql(3);

            socket.close();
        });

        context('When is open', () => {
            it('should throw an error', () => {
                const socket = new Socket('test_channel', new IPC());

                socket.open();

                expect(() => {
                    return socket.open();
                }).to.throw(Error);

                socket.close();
            });
        });
    });

    describe('.close', () => {
        context('When is open', () => {
            it('should remove listeners and pending requests', async () => {
                s1.open();

                const onSuccess = sinon.spy();
                const onFailure = sinon.spy();

                s1.request('test')
                    .then(onSuccess)
                    .catch(onFailure);
                s1.request('test')
                    .then(onSuccess)
                    .catch(onFailure);
                s1.request('test')
                    .then(onSuccess)
                    .catch(onFailure);
                s1.request('test')
                    .then(onSuccess)
                    .catch(onFailure);

                s1.close();

                await sleep(100);

                expect(onSuccess.callCount).to.equal(0);
                expect(onFailure.callCount).to.equal(4);
            });
        });

        context('When is closed', () => {
            it('should throw an error', () => {
                expect(() => {
                    s1.close();
                }).to.throw(Error);

                expect(() => {
                    s1.open();
                    s1.close();
                    s1.close();
                }).to.throw(Error);
            });
        });
    });

    describe('.isOpen', () => {
        context('When is open', () => {
            it('should return "true"', () => {
                const socket = new Socket('test_channel', new IPC());

                socket.open();

                expect(socket.isOpen).to.be.true;

                socket.close();

                socket.open();

                expect(socket.isOpen).to.be.true;
            });
        });

        context('When is closed', () => {
            it('should return "true"', () => {
                const socket = new Socket('test_channel', new IPC());

                expect(socket.isOpen).to.be.false;

                socket.open();

                expect(socket.isOpen).to.be.true;

                socket.close();

                expect(socket.isOpen).to.be.false;
            });
        });
    });

    describe('.request', () => {
        it('should send a request and recieve response', async () => {
            s1.open();
            s2.open();

            const onRequest = sinon.spy();

            s2.onRequest('test', (req: InboundRequest) => {
                onRequest(req.data);
                req.reply({ foo: 'bar' });
            });

            const resp = await s1.request('test', 'foo');

            expect(onRequest.callCount).to.equal(1);
            expect(onRequest.args[0][0]).to.eql('foo');
            expect(resp).to.eql({ foo: 'bar' });
        });

        context('When no request handler', () => {
            it('should resolve request with error', async () => {
                s1.open();
                s2.open();

                try {
                    await s1.request('test', 'foo');
                } catch (e) {
                    expect(e.toString()).to.contain(
                        'Request handler for "test" path not found',
                    );
                }
            });
        });
    });

    describe('.onRequest', () => {
        it('should reply with data', async () => {
            const onRequest = sinon.spy();
            const onEvent = sinon.spy();

            s1.open();
            s2.open();

            s1.onRequest('test', (req: InboundRequest) => {
                onRequest(req.path, req.data);
                req.reply();
            });
            s2.onEvent('test', onEvent);

            await s2.request('test', 'foo');

            expect(onEvent.callCount).to.equal(0);
            expect(onRequest.callCount).to.equal(1);
            expect(onRequest.args[0][0]).to.eql('test');
            expect(onRequest.args[0][1]).to.eql('foo');
        });

        it('should reply with error', async () => {
            const onError = sinon.spy();
            s1.open();
            s2.open();

            s1.onRequest('test', (req: InboundRequest) => {
                req.reply(new Error('test'));
            });

            try {
                await s2.request('test', 'foo');
            } catch (e) {
                onError(e);
            }

            expect(onError.called).to.be.true;
        });

        context('When error occurs in request handler', () => {
            it('should handle error and respond', async () => {
                s1.open();
                s2.open();

                s1.onRequest('test', () => {
                    throw new Error('test');
                });

                try {
                    await s2.request('test');
                } catch (e) {
                    expect(e).to.be.instanceOf(Error);
                }
            });

            it('should not handle error when message responded', async () => {
                const onError = sinon.spy();

                s1.open();
                s2.open();

                s1.onRequest('test', msg => {
                    msg.reply('foo');
                    throw new Error('Test');
                });

                try {
                    await s2.request('test');
                } catch (e) {
                    onError(e);
                }

                expect(onError.called).to.be.false;
            });
        });

        context('.onEvent', () => {
            it('should be called on event', async () => {
                const onEvent = sinon.spy();
                const onRequest = sinon.spy();

                s1.open();
                s2.open();

                s1.onEvent('test', onEvent);
                s1.onRequest('test', onRequest);

                s2.emit('test', 'foo');

                await sleep(50);

                expect(onEvent.callCount).to.equal(1);
                expect(onRequest.callCount).to.equal(0);
            });
        });

        context('When internal event is fired', () => {
            it('should handle internal events', () => {
                const onOpen = sinon.spy();
                const onClose = sinon.spy();

                s1.on('open', onOpen);
                s1.on('close', onClose);

                s1.open();
                s1.close();

                s1.open();
                s1.close();

                expect(onOpen.calledTwice).to.be.true;
                expect(onClose.calledTwice).to.be.true;
            });
        });
    });
});
