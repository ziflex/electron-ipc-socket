/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { expect } from 'chai';
import sinon from 'sinon';
import { Transport } from '../../src/transport';
import { Socket } from '../../src/socket';
import Bridge from '../../src/bridge';
import IPC from '../mock/ipc';


describe('Bridge', () => {
    let s1 = null;
    let s2 = null;
    let bridge = null;

    beforeEach(() => {
        const ipc = IPC();

        s1 = Socket('user-channel', Transport(ipc.input, ipc.output));
        s2 = Socket('user-channel', Transport(ipc.output, ipc.input));

        bridge = Bridge(s1, s2);
    });

    describe('#constructor', () => {
        context('When arguments are missed', () => {
            it('should throw an error', () => {
                expect(() => {
                    return Bridge();
                }).to.throw(Error);

                expect(() => {
                    return Bridge(IPC(), IPC());
                }).to.throw(Error);

                expect(() => {
                    return Bridge(Socket('user-channel', IPC()));
                }).to.throw(Error);

                expect(() => {
                    return Bridge(null, Socket('user-channel', IPC()));
                }).to.throw(Error);
            });
        });
    });

    describe('.open', () => {
        it('should open underlying sockets', () => {
            expect(s1.isOpen()).to.be.false;
            expect(s2.isOpen()).to.be.false;

            bridge.open();

            expect(s1.isOpen()).to.be.true;
            expect(s2.isOpen()).to.be.true;
        });

        it('should not open underlying sockets if they are already open', () => {
            s1.open();
            s2.open();

            expect(s1.isOpen()).to.be.true;
            expect(s2.isOpen()).to.be.true;

            bridge.open();

            expect(s1.isOpen()).to.be.true;
            expect(s2.isOpen()).to.be.true;
        });

        it('should add handlers for messages and events', () => {
            bridge.open();

            const onMessage = sinon.spy();
            const onEvent = sinon.spy();

            s1.on('message:foo', onMessage);
            s1.on('event:foo', onEvent);

            s2.send('foo', 'bar', sinon.spy());
            s2.send('foo', 'bar');

            expect(onMessage.called, 'onMessage must be called').to.be.true;
            expect(onEvent.called, 'onEvent must be called').to.be.true;
        });
    });

    describe('.close', () => {
        it('should close underlying sockets', () => {
            bridge.open();

            expect(s1.isOpen()).to.be.true;
            expect(s2.isOpen()).to.be.true;

            bridge.close();

            expect(s1.isOpen()).to.be.false;
            expect(s2.isOpen()).to.be.false;
        });

        it('should not close underlying sockets if they are already closed', () => {
            bridge.open();

            s1.close();
            s2.close();

            expect(s1.isOpen()).to.be.false;
            expect(s2.isOpen()).to.be.false;

            bridge.close();

            expect(s1.isOpen()).to.be.false;
            expect(s2.isOpen()).to.be.false;
        });

        it('should remove handlers for messages and events', () => {
            bridge.open();

            const onMessage = sinon.spy();
            const onEvent = sinon.spy();

            s1.on('message:foo', onMessage);
            s1.on('event:foo', onEvent);

            s2.send('foo', 'bar', sinon.spy());
            s2.send('foo', 'bar');

            bridge.close();

            s2.open();
            s2.send('foo', 'bar', sinon.spy());
            s2.send('foo', 'bar');

            expect(onMessage.calledOnce, 'onMessage must be called once').to.be.true;
            expect(onEvent.calledOnce, 'onEvent must be called once').to.be.true;
        });
    });

    describe('.dispose', () => {
        it('should not dispose underlying sockets', () => {
            bridge.dispose();

            expect(s1.isDisposed()).to.be.false;
            expect(s2.isDisposed()).to.be.false;
        });

        it('should should remove all handlers from underlying sockets', () => {
            bridge.dispose();

            const onMessage = sinon.spy();
            const onEvent = sinon.spy();

            s1.open();
            s2.open();

            s1.on('message:foo', onMessage);
            s1.on('event:foo', onEvent);

            s2.send('foo', 'bar', sinon.spy());
            s2.send('foo', 'bar');

            expect(onMessage.called).to.be.false;
            expect(onEvent.called).to.be.false;
        });
    });
});
