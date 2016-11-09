/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { expect } from 'chai';
import sinon from 'sinon';
import isError from 'is-error';
import Request from '../../src/request';

describe('Request', () => {
    describe('#constructor', () => {
        context('When arguments are missed', () => {
            it('should throw an error', () => {
                expect(() => {
                    return Request();
                }).to.throw(Error);

                expect(() => {
                    return Request({});
                }).to.throw(Error);

                expect(() => {
                    return Request([]);
                }).to.throw(Error);

                expect(() => {
                    return Request(1);
                }).to.throw(Error);

                expect(() => {
                    return Request('sds');
                }).to.throw(Error);
            });
        });
    });

    describe('.id', () => {
        it('should return generated id', () => {
            const req1 = Request(sinon.spy());

            expect(req1.id()).to.exist;

            const req2 = Request(sinon.spy());

            expect(req1.id()).to.not.eql(req2.id());
        });
    });

    describe('.timestamp', () => {
        it('should return timestamp', (done) => {
            const req1 = Request(sinon.spy());

            setTimeout(() => {
                const req2 = Request(sinon.spy());

                try {
                    expect(req2.timestamp()).to.not.eql(req1.timestamp());
                    expect(req2.timestamp() > req1.timestamp()).to.be.true;
                    done();
                } catch (e) {
                    done(e);
                }
            }, 10);
        });
    });

    describe('.resolve', () => {
        it('should call a callback and pass a given payload', () => {
            const callback = sinon.spy();
            const payload = { foo: 'bar' };
            const withPayload = Request(callback);

            withPayload.resolve(payload);

            expect(callback.callCount).to.equal(1);
            expect(callback.args[0][0]).to.not.exist;
            expect(callback.args[0][1]).to.eql(payload);

            const withoutPayload = Request(callback);

            withoutPayload.resolve();

            expect(callback.callCount).to.equal(2);
            expect(callback.args[1][0]).to.not.exist;
            expect(callback.args[1][1]).to.not.exist;
        });

        it('should dispose object', () => {
            const req = Request(sinon.spy());

            expect(req.isDisposed()).to.be.false;
            req.resolve();
            expect(req.isDisposed()).to.be.true;
        });
    });

    describe('.reject', () => {
        context('When reason is an Error', () => {
            it('should call a callback and pass a given error', () => {
                const callback = sinon.spy();
                const reason = new Error('Test error');
                const req = Request(callback);

                req.reject(reason);

                expect(callback.callCount).to.equal(1);
                expect(isError(callback.args[0][0])).to.be.true;
                expect(callback.args[0][0]).to.equal(reason);
                expect(callback.args[0][1]).to.not.exist;
            });
        });

        context('When reason is not an Error', () => {
            it('should call a callback and pass an Error with given reason', () => {
                const callback = sinon.spy();
                let req = Request(callback);

                req.reject('foo');

                expect(callback.callCount).to.equal(1);
                expect(callback.args[0][0]).to.not.eql('foo');
                expect(isError(callback.args[0][0])).to.be.true;
                expect(callback.args[0][1]).to.not.exist;

                req = Request(callback);

                req.reject();

                expect(callback.callCount).to.equal(2);
                expect(isError(callback.args[0][0])).to.be.true;
                expect(callback.args[0][1]).to.not.exist;
            });
        });

        it('should dispose object', () => {
            const req = Request(sinon.spy());

            expect(req.isDisposed()).to.be.false;
            req.reject(new Error('Test error'));
            expect(req.isDisposed()).to.be.true;
        });
    });
});
