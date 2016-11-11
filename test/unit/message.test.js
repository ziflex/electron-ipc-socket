/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { expect } from 'chai';
import sinon from 'sinon';
import Message from '../../src/message';

describe('Message', () => {
    describe('#constructor', () => {
        context('When arguments are missed', () => {
            it('should throw an error', () => {
                expect(() => {
                    return Message();
                }).to.throw(Error);

                expect(() => {
                    return Message({});
                }).to.throw(Error);

                expect(() => {
                    return Message({}, 'foo', 'bar', null);
                }).to.throw(Error);

                expect(() => {
                    return Message({}, null, 'bar', null, sinon.spy());
                }).to.throw(Error);

                expect(() => {
                    return Message({}, 'foo', null, null, sinon.spy());
                }).to.throw(Error);

                expect(() => {
                    return Message(null, 'foo', 'bar', null, sinon.spy());
                }).to.throw(Error);
            });
        });
    });

    describe('.type', () => {
        it('should return message type', () => {
            const msg = Message({}, 'message-id', 'message-type', null, sinon.spy());

            expect(msg.type()).to.eql('message-type');
        });
    });

    describe('.data', () => {
        it('should return message payload', () => {
            const withData = Message({}, 'message-id', 'message-type', { foo: 'bar' }, sinon.spy());

            expect(withData.data()).to.eql({ foo: 'bar' });

            const withoutData = Message({}, 'message-id', 'message-type', null, sinon.spy());

            expect(withoutData.data()).to.not.exist;
        });
    });

    describe('.reply', () => {
        context('When payload is not error', () => {
            it('should call a callback with a given payload', () => {
                const nativeEvt = {};
                const id = new Date().getTime().toString();
                const payload = { foo: 'bar' };
                const callback = sinon.spy();
                const msg = Message(nativeEvt, id, 'message', null, callback);

                msg.reply(payload);

                expect(callback.callCount).to.equal(1);
                expect(callback.args[0][0]).to.eql(nativeEvt);
                expect(callback.args[0][1]).to.eql(id);
                expect(callback.args[0][2]).to.not.exist;
                expect(callback.args[0][3]).to.eql(payload);
            });
        });

        context('When payload  error', () => {
            it('should call a callback with a given payload', () => {
                const nativeEvt = {};
                const id = new Date().getTime().toString();
                const payload = new Error('foo');
                const callback = sinon.spy();
                const msg = Message(nativeEvt, id, 'message', null, callback);

                msg.reply(payload);

                expect(callback.callCount).to.equal(1);
                expect(callback.args[0][0]).to.eql(nativeEvt);
                expect(callback.args[0][1]).to.eql(id);
                expect(callback.args[0][2]).to.eql(payload);
                expect(callback.args[0][3]).to.not.exist;
            });
        });

        it('should dispose after', () => {
            const id = new Date().getTime().toString();
            const msg = Message({}, id, 'message', null, sinon.spy());

            expect(msg.isDisposed()).to.be.false;
            msg.reply();
            expect(msg.isDisposed()).to.be.true;
        });
    });
});
