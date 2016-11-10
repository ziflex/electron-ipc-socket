/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { expect } from 'chai';
import sinon from 'sinon';
import Socket from '../../src/socket';
import { Transport } from '../../src/transport';
import IPC from '../mock/ipc';
import Webview from '../mock/webview';

describe('Socket', () => {
    let s1 = null;
    let s2 = null;

    beforeEach(() => {
        const ipc = IPC();

        s1 = Socket('user-channel', Transport(ipc.input, ipc.output));
        s2 = Socket('user-channel', Transport(ipc.output, ipc.input));
    });

    describe('#constructor', () => {
        context('When arguments are missed', () => {
            it('should throw an error', () => {
                expect(() => {
                    return Socket(null, IPC());
                }).to.throw(Error);

                expect(() => {
                    return Socket(1, IPC());
                }).to.throw(Error);

                expect(() => {
                    return Socket('', IPC());
                }).to.throw(Error);

                expect(() => {
                    return Socket('foo');
                }).to.throw(Error);

                expect(() => {
                    return Socket('foo', {});
                }).to.throw(Error);
            });
        });

        context('When WebView is passed as transport', () => {
            it('should wrap', () => {
                const ipc = IPC();
                const webview = Webview(ipc);
                const on = sinon.spy(webview, 'addEventListener');
                const send = sinon.spy(webview, 'send');

                const socket = new Socket('test_channel', webview);

                socket.open();

                socket.send('foo');

                expect(on.called).to.be.true;
                expect(send.called).to.be.true;
            });
        });
    });

    describe('.open', () => {
        it('should subscribe to event via transport', () => {
            const ipc = IPC();
            const on = sinon.spy(ipc, 'on');
            const socket = new Socket('test_channel', ipc);

            socket.open();

            expect(on.callCount).to.eql(3);
        });

        context('When is open', () => {
            it('should throw an error', () => {
                const socket = new Socket('test_channel', IPC());

                socket.open();

                expect(() => {
                    return socket.open();
                }).to.throw(Error);
            });
        });
    });

    describe('.close', () => {
        context('When is open', () => {
            it('should remove listeners and pending requests', () => {
                s1.open();

                const onResponse = sinon.spy();

                s1.send('message:test', onResponse);
                s1.send('message:test', onResponse);
                s1.send('message:test', onResponse);
                s1.send('message:test', onResponse);

                s1.close();

                expect(onResponse.callCount).to.equal(4);
                expect(onResponse.args[0][0]).to.exist;
                expect(onResponse.args[0][1]).to.not.exist;
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
                const socket = new Socket('test_channel', IPC());

                socket.open();

                expect(socket.isOpen()).to.be.true;

                socket.close();

                socket.open();

                expect(socket.isOpen()).to.be.true;
            });
        });

        context('When is closed', () => {
            it('should return "true"', () => {
                const socket = new Socket('test_channel', IPC());

                expect(socket.isOpen()).to.be.false;

                socket.open();
                socket.close();

                expect(socket.isOpen()).to.be.false;
            });
        });
    });

    describe('.send', () => {
        context('When response callback is passed', () => {
            it('should send message and recieve response', () => {
                s1.open();
                s2.open();

                const onResponse = sinon.spy();

                s2.on('message:test', (msg) => {
                    msg.reply({ foo: 'bar' });
                });

                s1.send('test', 'foo', onResponse);

                expect(onResponse.callCount).to.equal(1);
                expect(onResponse.args[0][0]).to.not.exist;
                expect(onResponse.args[0][1]).to.eql({ foo: 'bar' });
            });

            context('When timeout', () => {
                let clock = null;

                beforeEach(() => {
                    clock = sinon.useFakeTimers();
                });

                afterEach(() => {
                    clock.restore();
                });

                it('should resolve request with error', () => {
                    s1.open();
                    s2.open();

                    s2.on('message:test', () => {});

                    const onResponse = sinon.spy();

                    s1.send('test', 'foo', onResponse);

                    clock.tick(1000 * 60);
                    clock.tick(1000 * 60);

                    expect(onResponse.callCount).to.eql(1);
                    expect(onResponse.args[0][0]).to.exist;
                    expect(onResponse.args[0][1]).to.not.exist;
                });
            });

            context('When no message handler', () => {
                it('should resolve request with error', () => {
                    s1.open();
                    s2.open();

                    const onResponse = sinon.spy();

                    s1.send('test', 'foo', onResponse);

                    expect(onResponse.callCount).to.eql(1);
                    expect(onResponse.args[0][0]).to.exist;
                    expect(onResponse.args[0][1]).to.not.exist;
                });
            });

            context('When payload is not passed', () => {
                it('should throw an error', () => {
                    s1.open();
                    s2.open();

                    s2.on('message:test', (msg) => {
                        expect(msg.data()).to.not.exist;
                        msg.reply();
                    });

                    const onResponse = sinon.spy();

                    s1.send('test', onResponse);

                    expect(onResponse.callCount).to.eql(1);
                });
            });
        });

        context('When response callback is not passed', () => {
            it('should emit event', () => {
                s1.open();
                s2.open();

                const onEvent = sinon.spy();

                s2.on('event:test', onEvent);

                s1.send('test', 'foo');

                expect(onEvent.callCount).to.equal(1);
                expect(onEvent.args[0][0]).to.eql('foo');
            });
        });
    });

    describe('.on', () => {
        context('When message', () => {
            it('should add message handler', () => {
                const onEvent = sinon.spy();
                const onMessage = sinon.spy();
                const onResponse = sinon.spy();

                s1.open();
                s2.open();

                s1.on('event:test', onEvent);
                s1.on('message:test', onMessage);

                s2.send('test', 'foo', onResponse);

                expect(onEvent.callCount).to.equal(0);
                expect(onMessage.callCount).to.equal(1);
                expect(onMessage.args[0][0]).to.exist;
                expect(onMessage.args[0][0].data()).to.eql('foo');
                expect(onMessage.args[0][0].reply('bar'));
                expect(onResponse.callCount).to.equal(1);
            });

            context('When message handler already exists', () => {
                it('should throw an error', () => {
                    const onMessage = sinon.spy();

                    s1.open();
                    s2.open();

                    s1.on('message:test', onMessage);

                    expect(() => {
                        s1.on('message:test', onMessage);
                    }).to.throw(Error);
                });
            });

            context('When message name not passed', () => {
                it('should create global message handler', () => {
                    const onMessage = sinon.spy();
                    const onResponse = sinon.spy();

                    s1.open();
                    s2.open();

                    s1.on('message', (msg) => {
                        onMessage(msg.type());
                        msg.reply();
                    });

                    s2.send('foo', onResponse);
                    s2.send('bar', onResponse);
                    s2.send('qaz', onResponse);

                    expect(onMessage.callCount).to.equal(3);
                    expect(onMessage.args[0][0]).to.eql('foo');
                    expect(onMessage.args[1][0]).to.eql('bar');
                    expect(onMessage.args[2][0]).to.eql('qaz');
                });
            });

            context('When message name is "*"', () => {
                it('should create global message handler', () => {
                    const onMessage = sinon.spy();
                    const onResponse = sinon.spy();

                    s1.open();
                    s2.open();

                    s1.on('message', (msg) => {
                        onMessage(msg.type());
                        msg.reply();
                    });

                    s2.send('foo', onResponse);
                    s2.send('bar', onResponse);
                    s2.send('qaz', onResponse);

                    expect(onMessage.callCount).to.equal(3);
                    expect(onMessage.args[0][0]).to.eql('foo');
                    expect(onMessage.args[1][0]).to.eql('bar');
                    expect(onMessage.args[2][0]).to.eql('qaz');
                });
            });

            context('When global message handler is defined', () => {
                it('should be called when there are not matched handlers', () => {
                    const onTargetMessage = sinon.spy();
                    const onGlobalMessage = sinon.spy();
                    const onResponse = sinon.spy();

                    s1.open();
                    s2.open();

                    s1.on('message:test', onTargetMessage);
                    s1.on('message', onGlobalMessage);

                    s2.send('test', onResponse);
                    s2.send('bar', onResponse);
                    s2.send('qaz', onResponse);

                    expect(onTargetMessage.callCount).to.equal(1);
                    expect(onGlobalMessage.callCount).to.equal(2);
                });
            });
        });

        context('When event', () => {
            it('should be called on event', () => {
                const onEvent = sinon.spy();
                const onMessage = sinon.spy();

                s1.open();
                s2.open();

                s1.on('event:test', onEvent);
                s1.on('message:test', onMessage);

                s2.send('test', 'foo');

                expect(onEvent.callCount).to.equal(1);
                expect(onMessage.callCount).to.equal(0);
            });

            context('When event handler already exists', () => {
                it('should NOT throw an error', () => {
                    const onEvent = sinon.spy();
                    const onEvent2 = sinon.spy();

                    s1.open();
                    s2.open();

                    s1.on('event:test', onEvent);
                    s1.on('event:test', onEvent);
                    s1.on('event:test', onEvent2);

                    s2.send('test');

                    expect(onEvent.callCount).to.equal(2);
                    expect(onEvent2.callCount).to.equal(1);
                });
            });

            context('When event name is "*"', () => {
                it('should create global event handler', () => {
                    const onEvent = sinon.spy();

                    s1.open();
                    s2.open();

                    s1.on('event', onEvent);

                    s2.send('foo');
                    s2.send('bar');
                    s2.send('qaz');

                    expect(onEvent.callCount).to.equal(3);
                });
            });

            context('When webview as a transport', () => {
                it('should be called on event', () => {
                    const ipc = IPC();
                    const webview = Webview(ipc);
                    const onEvent = sinon.spy();

                    const socket1 = new Socket('test_channel', webview);
                    const socket2 = new Socket('test_channel', Transport(ipc.input, ipc.output));

                    socket1.open();
                    socket2.open();

                    socket1.on('event:test', onEvent);

                    socket2.send('test', 'foobar');

                    expect(onEvent.called).to.be.true;
                });
            });
        });

        context('When wrong type', () => {
            it('should throw an error', () => {
                s1.open();
                s2.open();

                expect(() => {
                    s1.on('test', sinon.spy());
                }).to.throw(Error);
            });
        });
    });

    describe('.off', () => {
        context('When message', () => {
            it('should remove message handler', () => {
                const onEvent = sinon.spy();
                const onMessage = sinon.spy();
                const onResponse = sinon.spy();

                s1.open();
                s2.open();

                s1.on('event:test', onEvent);
                s1.on('message:test', onMessage);

                s1.off('message:test', onMessage);

                s2.send('test', 'foo', onResponse);

                expect(onEvent.callCount).to.equal(0);
                expect(onMessage.callCount).to.equal(1);
                expect(onMessage.args[0][0]).to.exist;
                expect(onMessage.args[0][0].data()).to.eql('foo');
                expect(onMessage.args[0][0].reply('bar'));
                expect(onResponse.callCount).to.equal(1);
            });

            context('When message name is not passed', () => {
                it('should remove all message handlers', () => {
                    const onMessage1 = sinon.spy();
                    const onMessage2 = sinon.spy();
                    const onMessage3 = sinon.spy();
                    const onResponse = sinon.spy();

                    s1.open();
                    s2.open();

                    s1.on('message:1', onMessage1);
                    s1.on('message:2', onMessage2);
                    s1.on('message:3', onMessage3);

                    s1.off('message');

                    s2.send('1', 'foo', onResponse);
                    s2.send('2', 'foo', onResponse);
                    s2.send('3', 'foo', onResponse);

                    expect(onMessage1.callCount).to.equal(0);
                    expect(onMessage2.callCount).to.equal(0);
                    expect(onMessage3.callCount).to.equal(0);
                });
            });

            context('When message handler is not passed', () => {
                it('should remove handlers for message', () => {
                    const onMessage1 = sinon.spy();
                    const onMessage2 = sinon.spy();
                    const onMessage3 = sinon.spy();
                    const onResponse = sinon.spy();

                    s1.open();
                    s2.open();

                    s1.on('message:1', onMessage1);
                    s1.on('message:2', onMessage2);
                    s1.on('message:3', onMessage3);

                    s1.off('message:1');

                    s2.send('1', 'foo', onResponse);
                    s2.send('2', 'foo', onResponse);
                    s2.send('3', 'foo', onResponse);

                    expect(onMessage1.callCount).to.equal(0);
                    expect(onMessage2.callCount).to.equal(1);
                    expect(onMessage3.callCount).to.equal(1);
                });
            });
        });

        context('When event', () => {
            it('should remove event handler', () => {
                const onEvent1 = sinon.spy();
                const onEvent2 = sinon.spy();

                s1.open();
                s2.open();

                s1.on('event:test', onEvent1);
                s1.on('event:test', onEvent2);

                s1.off('event:test', onEvent2);

                s2.send('test', 'foo');

                expect(onEvent1.callCount).to.equal(1);
                expect(onEvent2.callCount).to.equal(0);
            });

            context('When handler is not registered', () => {
                it('should not mutate a collection of registered handlers', () => {
                    const onEvent1 = sinon.spy();
                    const onEvent2 = sinon.spy();

                    s1.open();
                    s2.open();

                    s1.on('event:test', onEvent1);

                    s1.off('event:test', onEvent2);

                    s2.send('test', 'foo');

                    expect(onEvent1.callCount).to.equal(1);
                    expect(onEvent2.callCount).to.equal(0);
                });
            });

            context('When no handlers', () => {
                it('should exit without error', () => {
                    const onEvent = sinon.spy();

                    s1.open();

                    expect(() => {
                        s1.off('event:test', onEvent);
                    }).to.not.throw(Error);
                });
            });

            context('When event name is not passed', () => {
                it('should remove all event handlers', () => {
                    const onEvent1 = sinon.spy();
                    const onEvent2 = sinon.spy();
                    const onEvent3 = sinon.spy();

                    s1.open();
                    s2.open();

                    s1.on('event:1', onEvent1);
                    s1.on('event:2', onEvent2);
                    s1.on('event:3', onEvent3);

                    s1.off('event');

                    s2.send('1');
                    s2.send('2');
                    s2.send('3');

                    expect(onEvent1.callCount).to.equal(0);
                    expect(onEvent2.callCount).to.equal(0);
                    expect(onEvent3.callCount).to.equal(0);
                });
            });

            context('When message handler is not passed', () => {
                it('should remove handlers for message', () => {
                    const onEvent1 = sinon.spy();
                    const onEvent2 = sinon.spy();
                    const onEvent3 = sinon.spy();

                    s1.open();
                    s2.open();

                    s1.on('event:1', onEvent1);
                    s1.on('event:1', onEvent2);
                    s1.on('event:3', onEvent3);

                    s1.off('event:1');

                    s2.send('1');
                    s2.send('2');
                    s2.send('3');

                    expect(onEvent1.callCount).to.equal(0);
                    expect(onEvent2.callCount).to.equal(0);
                    expect(onEvent3.callCount).to.equal(1);
                });
            });
        });

        context('When wrong type', () => {
            it('should throw an error', () => {
                s1.open();
                s2.open();

                expect(() => {
                    s1.off('test', sinon.spy());
                }).to.throw(Error);
            });
        });
    });

    describe('.dispose', () => {
        context('When open', () => {
            it('should close socket', () => {
                const ipc = IPC();
                const socket = Socket('user-channel', Transport(ipc.input, ipc.output));

                const onClose = sinon.spy(ipc.input, 'removeListener');

                socket.open();
                socket.dispose();

                expect(onClose.called).to.be.true;
            });
        });

        context('When closed', () => {
            it('should do nothing', () => {
                const ipc = IPC();
                const socket = Socket('user-channel', Transport(ipc.input, ipc.output));

                socket.open();
                socket.close();

                const onClose = sinon.spy(ipc.input, 'removeListener');
                socket.dispose();

                expect(onClose.called).to.be.false;
            });
        });
    });
});
