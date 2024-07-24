import type { Tagged } from "type-fest";

import { NamespacedLogger } from "./logger";
import { Guid, JoinStrings, newGuid } from "./string-manipulation";

type EventCallback = (...args: unknown[]) => void;
type EventMap = { [eventName: string]: EventCallback };
export type ListenerId = Tagged<Guid, "ListenerId">;

type CallbackMap<TEventMap extends EventMap> = {
  [eventName in keyof TEventMap]: Map<ListenerId, TEventMap[eventName]>;
};
export class EventManager<const TEventMap extends EventMap> {
  private readonly callbacks: CallbackMap<TEventMap> = {} as CallbackMap<TEventMap>;
  constructor(private readonly logger: NamespacedLogger<JoinStrings<string, "EventManager">>) {}

  addEventListener<const TEvent extends keyof TEventMap>(
    event: TEvent,
    callback: TEventMap[TEvent]
  ): ListenerId {
    this.logger.debug("Adding event listener", event);
    const callBackId = newGuid<ListenerId>();

    this.callbacksFor(event).set(callBackId, callback);
    return callBackId;
  }

  dispatchEvent<const TEvent extends keyof TEventMap>(
    event: TEvent,
    ...args: Parameters<TEventMap[TEvent]>
  ) {
    this.logger.debug("Dispatching event", event);
    const callbacks = this.callbacksFor(event);
    for (const callback of Object.values(callbacks)) {
      callback(...args);
    }
  }

  removeEventListener(event: keyof TEventMap, callbackId: ListenerId) {
    this.logger.debug("Removing event listener", event);
    this.callbacksFor(event).delete(callbackId);
  }

  private callbacksFor(event: keyof TEventMap): Map<ListenerId, TEventMap[keyof TEventMap]> {
    if (!this.callbacks[event]) {
      this.callbacks[event] = new Map();
    }

    return this.callbacks[event] as Map<ListenerId, TEventMap[keyof TEventMap]>;
  }
}
