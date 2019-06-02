import * as EventEmitter from 'events'

export interface Action {type: string, [key: string]: any}
export type Dispatch = (action: any) => Promise<any>
export type EditValue = ((value: any) => any) | any
export type Getter = (key: Key) => any
export type Key = string | symbol
export type Middleware = (action: any, next: Dispatch) => any
export type Reducer = (get: Getter, set: Setter, action: Action) => void
export type Setter = (key: Key, edit: EditValue) => Promise<any>

/**
 * Exported for type only; prefer `Dyad.getInstance()` over `new Dyad.Store()`.
 */
export class Store extends EventEmitter {
  constructor() {
    super()

    if (store) {
      return store
    }

    this.initialize()
  }

  // ---------------------------------------------------------------------------
  // Properties

  private _isDispatching!: boolean

  private _emittingByKey!: {[key: string]: boolean}

  private _middleware!: Middleware[]

  private _model!: {[key: string]: any}

  private _prevValueByKey!: {[key: string]: any}

  private _reducersByType!: {[type: string]: Reducer[]}

  // ---------------------------------------------------------------------------
  // Actions

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
  public dispatch(action: any): Promise<any> {
    if (this._isDispatching) {
      throw new Error('Reducers can’t dispatch actions')
    }

    const middleware = this._middleware
    const self = this

    let index = -1

    return (function call(nextIndex = 0, nextAction = action): Promise<any> {
      if (nextIndex <= index) {
        return Promise.reject(new Error('`next()` called more than once'))
      }

      index = nextIndex

      const nextMiddleware = middleware[nextIndex]

      if (!nextMiddleware) {
        if (!isPlainObject(nextAction)) {
          return Promise.reject(new Error('`action` is not a plain object'))
        }

        if (!('type' in nextAction)) {
          return Promise.reject(new Error('`action` doesn’t include a `type` property'))
        }

        const type = nextAction.type
        const reducers = self._reducersByType[type] || []

        reducers.forEach((reducer) => {
          try {
            self._isDispatching = true
            reducer(self.get, self.set, nextAction)
          } finally {
            self._isDispatching = false
          }
        })

        return Promise.resolve(nextAction)
      }

      try {
        ++nextIndex
        return Promise.resolve(nextMiddleware(nextAction, () => call(nextIndex, nextAction)))
      } catch (error) {
        return Promise.reject(error)
      }
    }())
  }

  /**
   * Registers one or more reducers to handle corresponding action types.
   *
   * @param actions - A collection of type-reducer pairs.
   *
   * @returns A reference to this store for chaining.
   */
  public bind(actions: {[type: string]: Reducer}): Store {
    Object.keys(actions).forEach((type) => {
      if (!this._reducersByType[type]) {
        this._reducersByType[type] = []
      }

      this._reducersByType[type].push(actions[type])
    })

    return this
  }

  // ---------------------------------------------------------------------------
  // Events

  /**
   * Don’t call `emit()` directly; it will be called transitively when a reducer
   * uses `set()` to mutate this store’s state.
   */
  public emit(key: Key, nextValue: any): boolean {
    if (!this._emittingByKey[key]) {
      throw new Error(`Can’t emit key '${key}' without setting it`)
    }

    return super.emit(key, nextValue)
  }

  // ---------------------------------------------------------------------------
  // Middleware

  /**
   * Adds `middleware` to this store; each middleware is given the opportunity,
   * in the order in which it was added to the store, to intercept, inspect, and
   * transform actions before they reach reducers.
   *
   * @param middleware - A function that will be given access to this store’s
   *     pre-reducer dispatch cycle.
   */
  public use(middleware: Middleware) {
    this._middleware.push(middleware)
  }

  // ---------------------------------------------------------------------------
  // Model

  /**
   * Sets (or resets) this store’s initial state.
   *
   * @param model - The desired initial state, if any.
   */
  public initialize(model?: {[key: string]: any}) {
    this._emittingByKey = {}
    this._isDispatching = false
    this._middleware = []
    this._model = {}
    this._prevValueByKey = {}
    this._reducersByType = {}
    this.removeAllListeners()

    if (model) {
      Object.keys(model).forEach((key) => this._model[key] = model[key])
    }
  }

  /**
   * Generates a list of this store’s keys.
   *
   * @returns This store’s keys ordered as would a normal `for...in` loop.
   */
  public keys(): Key[] {
    return Object.keys(this._model)
  }

  /**
   * Retrieves the value saved in this store under `key`.
   *
   * @param key - An identifier for a value saved in this store.
   *
   * @returns The value corresponding to `key`.
   */
  public get = (key: Key) => {
    return this._model[key]
  }

  /**
   * Queues `edit` to be saved asynchronously under `key` in this store.
   * If `set()` is called mutlitple times during a single event loop,
   * only the final value will be considered when action is eventually
   * taken; intermediate values resolved by earlier calls to `set()`
   * will be ignored.
   *
   * Each time a final value is determined, it will be compared to the one
   * previously stored under `key`. If the two are different, the final value
   * will be emitted as an event; otherwise no event will be emitted.
   *
   * @param key - The location where the resolved value of `edit` is stored.
   * @param edit - The value to save as `key` or a function, which – given
   *     the previous value of `key` – determines the next value to save.
   *
   * @returns A promise for the value eventually stored under `key`; if multiple
   *     values have been queued, this will be the final value resolved at the
   *     time the queue is culled.
   */
  private set = (key: Key, edit: EditValue): Promise<any> => {
    const model = this._model
    const value: any = model[key]
    const prevValueByKey = this._prevValueByKey

    if (!(key in prevValueByKey)) {
      prevValueByKey[key] = value
    }

    try {
      // Replace any prior value queued in the current event loop.
      model[key] = typeof edit === 'function' ? edit(value) : edit

      // Trust [spec’d Promise behavior](https://promisesaplus.com/#point-67)
      // to perform further processing asynchronously in next event loop,
      // allowing any subsequent values resolved in the current event loop
      // to replace `model[key]`.
      return Promise.resolve().then(() => {
        const nextValue = model[key]

        // The starting value will have been recorded in `prevValueByKey[key]`
        // during the previous event loop. Clear it and then compare it to the
        // current value stored under `key`. If the two values are different,
        // emit a corresponding event.
        if (key in prevValueByKey) {
          const prevValue = prevValueByKey[key]
          delete prevValueByKey[key]

          if (nextValue !== prevValue) {
            this._emittingByKey[key] = true
            try {
              this.emit(key, nextValue)
            } finally {
              this._emittingByKey[key] = false
            }
          }
        }

        return nextValue
      })
    } catch (error) {
      return Promise.reject(error)
    }
  }
}

const store = new Store()

/**
 * Returns the sole instance of `Store`.
 */
export function getInstance() {
  return store
}

// -----------------------------------------------------------------------------

function isPlainObject(x: any): boolean {
  if (x != null && typeof x === 'object') {
    let prototype = Object.getPrototypeOf(x)

    if (prototype === null) {
      return true
    }

    let nextPrototype
    while ((nextPrototype = Object.getPrototypeOf(prototype)) !== null) {
      prototype = nextPrototype
    }

    return Object.getPrototypeOf(x) === prototype
  }

  return false
}
