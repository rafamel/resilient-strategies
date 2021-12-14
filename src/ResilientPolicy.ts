import { NullaryFn } from 'type-core';
import { v4 as uuid } from 'uuid';
import { ensure } from 'errorish';
import { Push, Observable, Subject } from 'multitude';
import { AbortSignal } from 'abort-controller';
import { Strategy, Policy } from './definitions';
import { Util } from './helpers/Util';
import { ResilientStrategy } from './ResilientStrategy';

export class ResilientPolicy implements Policy {
  #strategy: Strategy;
  #events$: Push.Subject<Policy.Event>;
  public constructor(...strategies: Strategy[]) {
    this.#strategy = new ResilientStrategy(...strategies);
    this.#events$ = new Subject();
  }
  public get events$(): Push.Observable<Policy.Event> {
    return Observable.from(this.#events$);
  }
  public execute<O>(
    fn: NullaryFn<O | Promise<O>>,
    signal?: AbortSignal | null
  ): Policy.Request<O> {
    const id = uuid();
    const events$ = new Subject<Policy.Event>();
    const response = Util.execute(
      id,
      this.#strategy,
      fn,
      (event) => {
        events$.next(event);
        this.#events$.next(event);
      },
      signal
    );

    const teardown = Util.onAbort(() => {
      if (events$.closed) return;

      const event: Policy.Event = {
        id,
        group: 'execution',
        type: 'cancel',
        data: null
      };
      events$.next(event);
      this.#events$.next(event);
    }, signal);

    response.catch(Util.noop).finally(() => {
      events$.complete();
      teardown();
    });

    return {
      id,
      get events$() {
        return Observable.from(events$);
      },
      async response() {
        return response.catch((err) => {
          return Promise.reject(ensure(err, Error));
        });
      }
    };
  }
}
