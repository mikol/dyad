/// <reference types="node" />
import * as EventEmitter from 'events';
export interface Action {
    type: string;
    [key: string]: any;
}
export declare type Dispatch = (action: any) => Promise<any>;
export declare type EditValue = ((value: any) => any) | any;
export declare type Getter = (key: Key) => any;
export declare type Key = string | symbol;
export declare type Middleware = (action: any, next: Dispatch) => any;
export declare type Reducer = (get: Getter, set: Setter, action: Action) => void;
export declare type Setter = (key: Key, edit: EditValue) => Promise<any>;
/**
 * Exported for type only; prefer `Dyad.getInstance()` over `new Dyad.Store()`.
 */
export declare class Store extends EventEmitter {
    constructor();
    private _isDispatching;
    private _emittingByKey;
    private _middleware;
    private _model;
    private _prevValueByKey;
    private _reducersByType;
    /**
     * Triggers a possible state change, passing `action` through middleware
     * registerd via `use()`; then through reducers registered via `bind()`,
     * which may in turn call `set()` to change state.
     *
     * @param action - By default, a plain (preferrably serializable) object
     *     (with a `type` property to determine which reducers will handle it);
     *     middleware may accept additional types of values (for example,
     *     functions or promises) but such values must be transformed before
     *     they can ultimately be dispatched to corresponding reducers.
     *
     * @returns By default, a promise for the `original` action; however,
     *     middleware may resolve to something else (for example, a `cancel()`
     *     function for a deferred action).
     */
    dispatch(action: any): Promise<any>;
    /**
     * Registers one or more reducers to handle corresponding action types.
     *
     * @param actions - A collection of type-reducer pairs.
     *
     * @returns A reference to this store for chaining.
     */
    bind(actions: {
        [type: string]: Reducer;
    }): Store;
    /**
     * Don’t call `emit()` directly; it will be called transitively when a reducer
     * uses `set()` to mutate this store’s state.
     */
    emit(key: Key, nextValue: any): boolean;
    /**
     * Adds `middleware` to this store; each middleware is given the opportunity,
     * in the order in which it was added to the store, to intercept, inspect, and
     * transform actions before they reach reducers.
     *
     * @param middleware - A function that will be given access to this store’s
     *     pre-reducer dispatch cycle.
     */
    use(middleware: Middleware): void;
    /**
     * Sets (or resets) this store’s initial state.
     *
     * @param model - The desired initial state, if any.
     */
    initialize(model?: {
        [key: string]: any;
    }): void;
    /**
     * Generates a list of this store’s keys.
     *
     * @returns This store’s keys ordered as would a normal `for...in` loop.
     */
    keys(): Key[];
    /**
     * Retrieves the value saved in this store under `key`.
     *
     * @param key - An identifier for a value saved in this store.
     *
     * @returns The value corresponding to `key`.
     */
    get: (key: string | symbol) => any;
    /**
     * Queues `edit` to be saved asynchronously under `key` in this store.
     * If `set()` is called mutlitple times during a single event loop,
     * only the final value will be considered when action is eventually
     * taken; intermediate values resolved by earlier calls to `set()`
     * will be ignored.
     *
     * If `edit` itself is asynchronous, it will be queued until it is resolved
     * (or rejected). In effect `set()` will behave as if was called during
     * the future event loop in which `edit` resolves; only the final value
     * resolved during that future loop will be considered.
     *
     * Each time a final value is determined, it will be compared to the one
     * previously stored under `key`. If the two are different, the final value
     * will be passed through middleware, saved, and finally emitted as an event;
     * otherwise this store will remain unchanged, middleware will not be invoked,
     * and no event will be emitted.
     *
     * @param key - The location where the resolved value of `edit` is stored.
     * @param edit - The value (or a promise for the value) of `key` to save or a
     *     function, which – given the previous value of `key` – determines the
     *     next value of `key` to save.
     *
     * @returns A promise for the value eventually stored under `key`; if multiple
     *     values have been queued, this will be the final value resolved at the
     *     time the queue is culled.
     */
    private set;
}
/**
 * Returns the sole instance of `Store`.
 */
export declare function getInstance(): Store;
