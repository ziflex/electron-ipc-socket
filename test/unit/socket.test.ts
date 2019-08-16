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

    describe('#constructor', () => {
        context('When WebView is passed as transport', () => {
            xit('should wrap', () => {
                // const ipc = new IPC();
                // const webview = createWebview(ipc);
                // const on = sinon.spy(webview, 'addEventListener');
                // const send = sinon.spy(webview, 'send');
                // const socket = new Socket('test_channel', webview);
                // socket.open();
                // socket.send('foo');
                // expect(on.called).to.be.true;
                // expect(send.called).to.be.true;
            });
        });
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

        context('When no message handler', () => {
            xit('should resolve request with error', async () => {
                s1.open();
                s2.open();

                try {
                    await s1.request('test', 'foo');
                } catch (e) {
                    expect(e.toString()).to.be.eq(
                        'Handler for "test" not found',
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

    // describe('.off', () => {
    //     context('When message', () => {
    //         it('should remove message handler', () => {
    //             const onEvent = sinon.spy();
    //             const onMessage = sinon.spy();
    //             const onResponse = sinon.spy();

    //             s1.open();
    //             s2.open();

    //             s1.on('event:test', onEvent);
    //             s1.on('message:test', onMessage);

    //             s1.off('message:test', onMessage);

    //             s2.send('test', 'foo', onResponse);

    //             expect(onEvent.callCount).to.equal(0);
    //             expect(onMessage.callCount).to.equal(1);
    //             expect(onMessage.args[0][0]).to.exist;
    //             expect(onMessage.args[0][0].data()).to.eql('foo');
    //             expect(onMessage.args[0][0].reply('bar'));
    //             expect(onResponse.callCount).to.equal(1);
    //         });

    //         context('When message name is not passed', () => {
    //             it('should remove all message handlers', () => {
    //                 const onMessage1 = sinon.spy();
    //                 const onMessage2 = sinon.spy();
    //                 const onMessage3 = sinon.spy();
    //                 const onResponse = sinon.spy();

    //                 s1.open();
    //                 s2.open();

    //                 s1.on('message:1', onMessage1);
    //                 s1.on('message:2', onMessage2);
    //                 s1.on('message:3', onMessage3);

    //                 s1.off('message');

    //                 s2.send('1', 'foo', onResponse);
    //                 s2.send('2', 'foo', onResponse);
    //                 s2.send('3', 'foo', onResponse);

    //                 expect(onMessage1.callCount).to.equal(0);
    //                 expect(onMessage2.callCount).to.equal(0);
    //                 expect(onMessage3.callCount).to.equal(0);
    //             });
    //         });

    //         context('When message handler is not passed', () => {
    //             it('should remove handlers for message', () => {
    //                 const onMessage1 = sinon.spy();
    //                 const onMessage2 = sinon.spy();
    //                 const onMessage3 = sinon.spy();
    //                 const onResponse = sinon.spy();

    //                 s1.open();
    //                 s2.open();

    //                 s1.on('message:1', onMessage1);
    //                 s1.on('message:2', onMessage2);
    //                 s1.on('message:3', onMessage3);

    //                 s1.off('message:1');

    //                 s2.send('1', 'foo', onResponse);
    //                 s2.send('2', 'foo', onResponse);
    //                 s2.send('3', 'foo', onResponse);

    //                 expect(onMessage1.callCount).to.equal(0);
    //                 expect(onMessage2.callCount).to.equal(1);
    //                 expect(onMessage3.callCount).to.equal(1);
    //             });
    //         });
    //     });

    //     context('When event', () => {
    //         it('should remove event handler', () => {
    //             const onEvent1 = sinon.spy();
    //             const onEvent2 = sinon.spy();

    //             s1.open();
    //             s2.open();

    //             s1.on('event:test', onEvent1);
    //             s1.on('event:test', onEvent2);

    //             s1.off('event:test', onEvent2);

    //             s2.send('test', 'foo');

    //             expect(onEvent1.callCount).to.equal(1);
    //             expect(onEvent2.callCount).to.equal(0);
    //         });

    //         context('When handler is not registered', () => {
    //             it('should not mutate a collection of registered handlers', () => {
    //                 const onEvent1 = sinon.spy();
    //                 const onEvent2 = sinon.spy();

    //                 s1.open();
    //                 s2.open();

    //                 s1.on('event:test', onEvent1);

    //                 s1.off('event:test', onEvent2);

    //                 s2.send('test', 'foo');

    //                 expect(onEvent1.callCount).to.equal(1);
    //                 expect(onEvent2.callCount).to.equal(0);
    //             });
    //         });

    //         context('When no handlers', () => {
    //             it('should exit without error', () => {
    //                 const onEvent = sinon.spy();

    //                 s1.open();

    //                 expect(() => {
    //                     s1.off('event:test', onEvent);
    //                 }).to.not.throw(Error);
    //             });
    //         });

    //         context('When event name is not passed', () => {
    //             it('should remove all event handlers', () => {
    //                 const onEvent1 = sinon.spy();
    //                 const onEvent2 = sinon.spy();
    //                 const onEvent3 = sinon.spy();

    //                 s1.open();
    //                 s2.open();

    //                 s1.on('event:1', onEvent1);
    //                 s1.on('event:2', onEvent2);
    //                 s1.on('event:3', onEvent3);

    //                 s1.off('event');

    //                 s2.send('1');
    //                 s2.send('2');
    //                 s2.send('3');

    //                 expect(onEvent1.callCount).to.equal(0);
    //                 expect(onEvent2.callCount).to.equal(0);
    //                 expect(onEvent3.callCount).to.equal(0);
    //             });
    //         });

    //         context('When message handler is not passed', () => {
    //             it('should remove handlers for message', () => {
    //                 const onEvent1 = sinon.spy();
    //                 const onEvent2 = sinon.spy();
    //                 const onEvent3 = sinon.spy();

    //                 s1.open();
    //                 s2.open();

    //                 s1.on('event:1', onEvent1);
    //                 s1.on('event:1', onEvent2);
    //                 s1.on('event:3', onEvent3);

    //                 s1.off('event:1');

    //                 s2.send('1');
    //                 s2.send('2');
    //                 s2.send('3');

    //                 expect(onEvent1.callCount).to.equal(0);
    //                 expect(onEvent2.callCount).to.equal(0);
    //                 expect(onEvent3.callCount).to.equal(1);
    //             });
    //         });
    //     });

    //     context('When internal event is fired', () => {
    //         it('should remove handlers for internal events', () => {
    //             const onOpen = sinon.spy();
    //             const onClose = sinon.spy();

    //             s1.on('open', onOpen);
    //             s1.on('close', onClose);

    //             s1.open();
    //             s1.close();

    //             s1.off('open', onOpen);
    //             s1.off('close', onClose);

    //             s1.open();
    //             s1.close();

    //             expect(onOpen.callCount).to.equal(1);
    //             expect(onClose.callCount).to.equal(1);
    //         });
    //     });

    //     context('When wrong type', () => {
    //         it('should throw an error', () => {
    //             s1.open();
    //             s2.open();

    //             expect(() => {
    //                 s1.off('test', sinon.spy());
    //             }).to.throw(Error);
    //         });
    //     });
    // });

    // describe('.dispose', () => {
    //     context('When open', () => {
    //         it('should close socket', () => {
    //             const ipc = IPC();
    //             const socket = Socket('user-channel', Transport(ipc.input, ipc.output));

    //             const onClose = sinon.spy(ipc.input, 'removeListener');

    //             socket.open();
    //             socket.dispose();

    //             expect(onClose.called).to.be.true;
    //         });
    //     });

    //     context('When closed', () => {
    //         it('should do nothing', () => {
    //             const ipc = IPC();
    //             const socket = Socket('user-channel', Transport(ipc.input, ipc.output));

    //             socket.open();
    //             socket.close();

    //             const onClose = sinon.spy(ipc.input, 'removeListener');
    //             socket.dispose();

    //             expect(onClose.called).to.be.false;
    //         });
    //     });
    // });

    // describe('events', () => {
    //     describe('open', () => {
    //         it('should notify when it gets open', () => {
    //             const onOpen = sinon.spy();

    //             s1.on('open', onOpen);

    //             s1.open();

    //             expect(onOpen.calledOnce).to.be.true;
    //             expect(onOpen.args[0][0]).to.equal(s1);
    //         });
    //     });

    //     describe('close', () => {
    //         it('should notify when it gets closed', () => {
    //             const onClose = sinon.spy();

    //             s1.on('close', onClose);

    //             s1.open();
    //             s1.close();

    //             expect(onClose.calledOnce).to.be.true;
    //             expect(onClose.args[0][0]).to.equal(s1);
    //         });
    //     });

    //     describe('error', () => {
    //         context('When message', () => {
    //             it('should notify when unhandled error occured in message handler', () => {
    //                 const onError = sinon.spy();
    //                 const onResponse = sinon.spy();
    //                 const err = new Error('Foo bar');

    //                 s1.open();
    //                 s2.open();

    //                 s1.on('error', onError);

    //                 s1.on('message', (msg) => {
    //                     msg.reply('foo');
    //                     throw err;
    //                 });

    //                 s2.send('test', onResponse);

    //                 expect(onResponse.called).to.be.true;
    //                 expect(onError.calledOnce).to.be.true;
    //                 expect(onError.args[0][0]).to.equal(s1);
    //                 expect(onError.args[0][1].error).to.eql(err);
    //                 expect(onError.args[0][1].type).to.eql('message');
    //                 expect(onError.args[0][1].name).to.eql('test');
    //             });
    //         });

    //         context('When event', () => {
    //             it('should notify when unhandled error occured in event handler', () => {
    //                 const onError = sinon.spy();
    //                 const err = new Error('Foo bar');

    //                 s1.open();
    //                 s2.open();

    //                 s1.on('error', onError);

    //                 s1.on('event', () => {
    //                     throw err;
    //                 });

    //                 s2.send('test');

    //                 expect(onError.calledOnce).to.be.true;
    //                 expect(onError.args[0][0]).to.equal(s1);
    //                 expect(onError.args[0][1].error).to.eql(err);
    //                 expect(onError.args[0][1].type).to.eql('event');
    //                 expect(onError.args[0][1].name).to.eql('test');
    //             });
    //         });
    //     });
});
