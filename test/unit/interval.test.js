/* eslint-disable no-unused-expressions, import/no-extraneous-dependencies */
import { expect } from 'chai';
import sinon from 'sinon';
import Interval from '../../src/interval';

describe('Interval', () => {
    describe('#constructor', () => {
        context('When arguments are missed', () => {
            it('should throw an error', () => {
                expect(() => {
                    return Interval();
                }).to.throw(Error);

                expect(() => {
                    return Interval({});
                }).to.throw(Error);

                expect(() => {
                    return Interval(sinon.spy(), null);
                }).to.throw(Error);

                expect(() => {
                    return Interval(sinon.spy(), {});
                }).to.throw(Error);

                expect(() => {
                    return Interval(sinon.spy(), '');
                }).to.throw(Error);
            });
        });
    });

    describe('.start', () => {
        let clock = null;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });

        afterEach(() => {
            clock.restore();
        });

        it('should call handler on each tick', () => {
            const spy = sinon.spy();
            const interval = Interval(spy, 1000);

            interval.start();

            clock.tick(1000);

            expect(spy.callCount).to.equal(1);
        });

        context('When called more then once', () => {
            it('should throw an error', () => {
                const interval = Interval(sinon.spy(), 1000);

                interval.start();

                expect(() => {
                    interval.start();
                }).to.throw(Error);
            });
        });
    });

    describe('.start', () => {
        let clock = null;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });

        afterEach(() => {
            clock.restore();
        });

        it('should stop calling handler on each tick', () => {
            const spy = sinon.spy();
            const interval = Interval(spy, 1000);

            interval.start();

            clock.tick(1000);

            expect(spy.callCount).to.equal(1);

            interval.stop();

            clock.tick(1200);

            expect(spy.callCount).to.equal(1);
        });

        context('When called more then once', () => {
            it('should throw an error', () => {
                const interval = Interval(sinon.spy(), 1000);

                expect(() => {
                    interval.stop();
                }).to.throw(Error);

                interval.start();
                interval.stop();

                expect(() => {
                    interval.stop();
                }).to.throw(Error);
            });
        });
    });

    describe('.isRunning', () => {
        context('When is stopped', () => {
            it('should return "false"', () => {
                const interval = Interval(sinon.spy(), 1000);

                expect(interval.isRunning()).to.be.false;
            });
        });

        context('When is running', () => {
            it('should return "true"', () => {
                const interval = Interval(sinon.spy(), 1000);

                interval.start();

                expect(interval.isRunning()).to.be.true;

                interval.stop();

                expect(interval.isRunning()).to.be.false;
            });
        });
    });

    context('When disposed', () => {
        let clock = null;

        beforeEach(() => {
            clock = sinon.useFakeTimers();
        });

        afterEach(() => {
            clock.restore();
        });

        it('should be stopped', () => {
            const spy = sinon.spy();
            const interval = Interval(spy, 1000);

            interval.start();

            clock.tick(1000);

            expect(spy.callCount).to.equal(1);

            interval.dispose();

            clock.tick(1200);

            expect(spy.callCount).to.equal(1);
        });
    });
});
