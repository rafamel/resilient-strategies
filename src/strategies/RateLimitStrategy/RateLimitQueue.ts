import { NullaryFn } from 'type-core';

export declare namespace RateLimitQueue {
  interface Options {
    limit: number;
    interval: number;
    smoothDelay: boolean;
  }
}

export class RateLimitQueue {
  #options: RateLimitQueue.Options;
  #queue: NullaryFn[];
  #timestamps: number[];
  #timeout: NodeJS.Timeout | null;
  #lock: boolean;
  public constructor(options: RateLimitQueue.Options) {
    this.#options = options;
    this.#queue = [];
    this.#timestamps = [];
    this.#timeout = null;
    this.#lock = false;
  }
  public enqueue(fn: NullaryFn): void {
    const queue = this.#queue;

    queue.push(fn);
    this.#execute();
  }
  public dequeue(fn: NullaryFn): void {
    const queue = this.#queue;

    const index = queue.indexOf(fn);
    if (index >= 0) queue.splice(index, 1);

    if (!queue.length) {
      const timeout = this.#timeout;
      if (timeout) clearTimeout(timeout);
      this.#lock = false;
    }
  }
  #execute(): void {
    const lock = this.#lock;
    if (lock) return;

    const queue = this.#queue;
    if (!queue.length) return;

    this.#lock = true;
    const nextTimeRemaining = this.#getNextTimeRemaining();
    if (nextTimeRemaining) {
      this.#timeout = setTimeout(() => {
        this.#executeNext();
        this.#lock = false;
        this.#execute();
      }, nextTimeRemaining);
    } else {
      this.#executeNext();
      this.#lock = false;
      this.#execute();
    }
  }
  #executeNext(): void {
    const queue = this.#queue;

    const fn = queue.shift();
    if (!fn) return;

    const timestamps = this.#timestamps;
    timestamps.push(Date.now());
    fn();
  }
  #getNextTimeRemaining(): number {
    this.#clearOldTimestamps();

    const { limit, interval, smoothDelay } = this.#options;
    const timestamps = this.#timestamps;

    if (smoothDelay) {
      const timeForEach = interval / limit;
      const timeTotal = Math.floor(timeForEach * timestamps.length);
      return Math.max(
        0,
        timestamps.length < limit
          ? 0
          : timestamps[0] + interval + 1 - Date.now(),
        timestamps[0] + timeTotal - Date.now()
      );
    }

    return timestamps.length < limit
      ? 0
      : Math.max(0, timestamps[0] + interval + 1 - Date.now());
  }
  #clearOldTimestamps(): void {
    const { interval } = this.#options;
    const timestamps = this.#timestamps;

    const intervalStart = Date.now() - interval;
    while (timestamps[0] < intervalStart) {
      timestamps.shift();
    }
  }
}
