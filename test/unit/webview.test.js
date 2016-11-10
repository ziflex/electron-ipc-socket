/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { expect } from 'chai';
import sinon from 'sinon';
import DOMElement from '../../src/webview';
import Webview from '../mock/webview';
import NodeElement from '../mock/element';
import IPC from '../mock/ipc';

describe('Dom Element', () => {
    describe('#constructor', () => {
        context('When arguments are missed or invalid', () => {
            it('should throw an error', () => {
                expect(() => {
                    DOMElement();
                }).to.throw(Error);

                expect(() => {
                    DOMElement({});
                }).to.throw(Error);

                expect(() => {
                    DOMElement(NodeElement('div'));
                }).to.throw(Error);
            });
        });
    });

    describe('.on', () => {
        it('should notify subscribers', () => {
            const ipc = IPC();
            const element = DOMElement(Webview(ipc));
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();

            element.on('test', spy1);
            element.on('test', spy2);

            ipc.input.emit('ipc-message', { channel: 'test' }, ['foo']);

            expect(spy1.callCount).to.equal(1);
            expect(spy2.callCount).to.equal(1);
            expect(spy1.args[0][0]).to.eql('foo');
        });

        it('should handle payload-less events', () => {
            const ipc = IPC();
            const element = DOMElement(Webview(ipc));
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();

            element.on('test', spy1);
            element.on('test', spy2);

            ipc.input.emit('ipc-message', { channel: 'test' });

            expect(spy1.callCount).to.equal(1);
            expect(spy2.callCount).to.equal(1);
            expect(spy1.args[0][0]).to.not.exist;
        });
    });

    describe('.once', () => {
        it('should notify subscribers only once', () => {
            const ipc = IPC();
            const element = DOMElement(Webview(ipc));
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();

            element.once('test', spy1);
            element.once('test', spy2);

            ipc.input.emit('ipc-message', { channel: 'test' }, ['foo']);
            ipc.input.emit('ipc-message', { channel: 'test' }, ['foo']);
            ipc.input.emit('ipc-message', { channel: 'test' }, ['foo']);

            expect(spy1.callCount).to.equal(1);
            expect(spy2.callCount).to.equal(1);
        });
    });

    describe('.removeListener', () => {
        it('should remove event listener', () => {
            const ipc = IPC();
            const element = DOMElement(Webview(ipc));
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();

            element.addListener('test', spy1);
            element.addListener('test', spy2);

            ipc.input.emit('ipc-message', { channel: 'test' }, ['foo']);

            element.removeListener('test', spy1);

            ipc.input.emit('ipc-message', { channel: 'test' }, ['foo']);

            element.off('test', spy2);

            ipc.input.emit('ipc-message', { channel: 'test' }, ['foo']);

            expect(spy1.callCount).to.equal(1);
            expect(spy2.callCount).to.equal(2);
        });
    });

    describe('.removeAllListeners', () => {
        it('should remove all listeners', () => {
            const ipc = IPC();
            const element = DOMElement(Webview(ipc));
            const spy1 = sinon.spy();
            const spy2 = sinon.spy();
            const spy3 = sinon.spy();

            element.addListener('test', spy1);
            element.addListener('test', spy2);
            element.addListener('test', spy3);

            element.removeAllListeners();

            ipc.input.emit('ipc-message', { channel: 'test' }, ['foo']);

            expect(spy1.callCount).to.equal(0);
            expect(spy2.callCount).to.equal(0);
            expect(spy3.callCount).to.equal(0);
        });
    });

    describe('.send', () => {
        it('should send messages via IPC object', () => {
            const ipc = IPC();
            const element = DOMElement(Webview(ipc));
            const spy = sinon.spy();

            ipc.output.addListener('test', spy);

            element.send('test', 'foo');

            expect(spy.callCount).to.equal(1);
            expect(spy.args[0][0]).to.eql('foo');
        });
    });
});
