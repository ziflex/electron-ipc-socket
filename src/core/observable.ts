import NanoEvents from 'nanoevents';
import unbindAll from 'nanoevents/unbind-all';
import { Disposable } from './disposable';

export type Subscriber<T = any> = (args: T) => void;
export type Subscription = () => void;

export class Observable extends Disposable {
    private __emitter: NanoEvents<any>;

    constructor() {
        super();

        this.__emitter = new NanoEvents();
    }

    public dispose(): void {
        super.dispose();

        unbindAll(this.__emitter);
    }

    public emit(event: string | symbol, args?: any): void {
        Disposable.assert(this);

        this.__emitter.emit(event, args);
    }

    public on<T = any>(
        event: string | symbol,
        subscriber: Subscriber<T>,
        once: boolean = false,
    ): Subscription {
        Disposable.assert(this);

        if (!once) {
            return this.__emitter.on(event, subscriber);
        }

        let unbind: Subscription | undefined = this.__emitter.on(
            event,
            (args: any) => {
                if (unbind != null) {
                    subscriber(args);
                    unbind();
                    unbind = undefined;
                }
            },
        );

        return () => {
            if (unbind != null) {
                unbind();
            }
        };
    }

    protected __hasHandler(event: string): boolean {
        const events = (this.__emitter as any).events[event] as any[];

        return events != null && events.length > 0;
    }
}
