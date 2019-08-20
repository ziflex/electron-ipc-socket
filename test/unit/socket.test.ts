/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { expect } from 'chai';
import sinon from 'sinon';
import { InboundRequest } from '../../src/inbound-request';
import { Socket } from '../../src/socket';
import { Transport } from '../../src/transport';
import { IPC } from '../mock/ipc';

async function sleep(time: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, time));
}

describe('Socket', () => {
    let s1: Socket;
    let s2: Socket;

    beforeEach(() => {
        const ipc = new IPC();

        s1 = new Socket(new Transport(ipc.input, ipc.output));
        s2 = new Socket(new Transport(ipc.output, ipc.input));
    });

    afterEach(() => {
        if (s1.isOpen) {
            s1.close();
        }

        if (s2.isOpen) {
            s2.close();
        }
    })

    describe('.open', () => {
        it('should subscribe to event via transport', () => {
            const ipc = new IPC();
            const on = sinon.spy(ipc, 'on');
            const socket = new Socket(ipc);

            socket.open('test_channel');

            expect(on.callCount).to.eql(3);

            socket.close();
        });

        context('When is open', () => {
            it('should throw an error', () => {
                const socket = new Socket(new IPC());

                socket.open('test_channel');

                expect(() => {
                    return socket.open('test_channel');
                }).to.throw(Error);

                socket.close();
            });
        });
    });

    describe('.close', () => {
        context('When is open', () => {
            it('should remove listeners and pending requests', async () => {
                s1.open('test_channel');

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
                    s1.open('test_channel');
                    s1.close();
                    s1.close();
                }).to.throw(Error);
            });
        });
    });

    describe('.isOpen', () => {
        context('When is open', () => {
            it('should return "true"', () => {
                const socket = new Socket(new IPC());

                socket.open('test_channel');

                expect(socket.isOpen).to.be.true;

                socket.close();

                socket.open('test_channel');

                expect(socket.isOpen).to.be.true;

                socket.close();
            });
        });

        context('When is closed', () => {
            it('should return "true"', () => {
                const socket = new Socket(new IPC());

                expect(socket.isOpen).to.be.false;

                socket.open('test_channel');

                expect(socket.isOpen).to.be.true;

                socket.close();

                expect(socket.isOpen).to.be.false;
            });
        });
    });

    describe('.request', () => {
        it('should send a request and recieve response', async () => {
            s1.open('test_channel');
            s2.open('test_channel');

            const onRequest = sinon.spy();

            s2.onRequest('test', (req: InboundRequest) => {
                onRequest(req.data);

                return { foo: 'bar' };
            });

            const resp = await s1.request('test', 'foo');

            expect(onRequest.callCount).to.equal(1);
            expect(onRequest.args[0][0]).to.eql('foo');
            expect(resp).to.eql({ foo: 'bar' });

            s1.close();
            s2.close();
        });

        context('When no request handler', () => {
            it('should resolve request with error', async () => {
                s1.open('test_channel');
                s2.open('test_channel');

                try {
                    await s1.request('test', 'foo');
                } catch (e) {
                    expect(e.toString()).to.contain(
                        'Request handler for "test" path not found',
                    );
                }

                s1.close();
                s2.close();
            });
        });
    });

    describe('.onRequest', () => {
        it('should reply with data', async () => {
            const onRequest = sinon.spy();
            const onEvent = sinon.spy();

            s1.open('test_channel');
            s2.open('test_channel');

            s1.onRequest('test', (req: InboundRequest) => {
                onRequest(req.path, req.data);
            });
            s2.onEvent('test', onEvent);

            await s2.request('test', 'foo');

            expect(onEvent.callCount).to.equal(0);
            expect(onRequest.callCount).to.equal(1);
            expect(onRequest.args[0][0]).to.eql('test');
            expect(onRequest.args[0][1]).to.eql('foo');

            s1.close();
            s2.close();
        });

        it('should reply with error', async () => {
            const onError = sinon.spy();
            s1.open('test_channel');
            s2.open('test_channel');

            s1.onRequest('test', (req: InboundRequest) => {
                return new Error('test');
            });

            try {
                await s2.request('test', 'foo');
            } catch (e) {
                onError(e);
            }

            expect(onError.called).to.be.true;

            s1.close();
            s2.close();
        });

        context('When error occurs in request handler', () => {
            it('should handle error and respond', async () => {
                s1.open('test_channel');
                s2.open('test_channel');

                s1.onRequest('test', () => {
                    throw new Error('test');
                });

                try {
                    await s2.request('test');
                } catch (e) {
                    expect(e).to.be.instanceOf(Error);
                }

                s1.close();
                s2.close();
            });
        });

        context('.onEvent', () => {
            it('should be called on event', async () => {
                const onEvent = sinon.spy();
                const onRequest = sinon.spy();

                s1.open('test_channel');
                s2.open('test_channel');

                s1.onEvent('test', onEvent);
                s1.onRequest('test', onRequest);

                s2.send('test', 'foo');

                await sleep(50);

                expect(onEvent.callCount).to.equal(1);
                expect(onRequest.callCount).to.equal(0);

                s1.close();
                s2.close();
            });
        });

        context('When internal event is fired', () => {
            it('should handle errors', async () => {
                const onError = sinon.spy();

                s1.onError(onError);

                s1.open('test_channel');
                s2.open('test_channel');

                s1.onRequest('test', () => {
                    throw new Error('test');
                });

                try {
                    await s2.request('test');
                } catch (e) {}

                await sleep(10);

                expect(onError.called).to.be.true;

                s1.close();
                s2.close();
            });
        });
    });
});
