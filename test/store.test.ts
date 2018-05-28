import {expect} from 'chai'
import * as sinon from 'sinon'

import * as Dyad from '../src/dyad'

const store = Dyad.getInstance()

describe('store', () => {
  before(() => store.initialize())

  afterEach(() => store.initialize())

  describe('core', () => {
    it('starts empty', () => {
      expect(store.keys().length).to.equal(0)
    })

    it('initializes `key`', () => {
      expect(store.get('x')).to.be.undefined

      store.initialize({'x': 0})

      expect(store.keys().length).to.equal(1)
      expect(store.get('x')).to.equal(0)
    })

    it('emits on `dispatch()`', () => {
      return new Promise((resolve, reject) => {
        store.on('x', (nextValue) => {
          try {
            expect(nextValue).to.equal(13)
            resolve()
          } catch (error) {
            reject(error)
          }
        })

        store.bind({
          X: (_, set: Dyad.Setter, action: Dyad.Action) => {
            set('x', 13).then(() => reject(new Error('`dispatch()` didn’t emit')))
          }
        })

        store.dispatch({type: 'X'})
      })
    })

    it('only emits last synchronous `dispatch()`', () => {
      return new Promise((resolve, reject) => {
        store.on('x', (nextValue) => {
          try {
            expect(nextValue).to.equal(13)
            resolve()
          } catch (error) {
            reject(error)
          }
        })

        store.bind({
          TYPE: (_, set: Dyad.Setter, action: Dyad.Action) => {
            set('x', action.payload)
          }
        })

        store.dispatch({type: 'TYPE', payload: 11})
        store.dispatch({type: 'TYPE', payload: 13})
      })
    })

    it('increments/decrements', () => {
      return new Promise((resolve, reject) => {
        store.initialize({counter: 0})

        store.on('counter', (nextValue) => {
          try {
            expect(nextValue).to.equal(1)
          } catch (error) {
            reject(error)
          }
        })

        store.bind({
          DECREMENT: (_, set: Dyad.Setter, action: Dyad.Action) =>
            set('counter', (prevValue: number) => --prevValue),
          INCREMENT: (_, set: Dyad.Setter, action: Dyad.Action) =>
            set('counter', (prevValue: number) => ++prevValue)
        })

        store.dispatch({type: 'INCREMENT'})
        store.dispatch({type: 'INCREMENT'})
        store.dispatch({type: 'INCREMENT'})
        store.dispatch({type: 'DECREMENT'})
        store.dispatch({type: 'DECREMENT'}).then(resolve)
      })
    })

    it('ignores moot `dispatch()`', () => {
      return new Promise((resolve, reject) => {
        store.initialize({counter: 0})

        store.on('counter', () => reject(new Error('`dispatch()` didn’t ignore unchanged value')))

        store.bind({
          DECREMENT: (_, set: Dyad.Setter, action: Dyad.Action) =>
            set('counter', (prevValue: number) => --prevValue),
          INCREMENT: (_, set: Dyad.Setter, action: Dyad.Action) =>
            set('counter', (prevValue: number) => ++prevValue)
        })

        store.dispatch({type: 'INCREMENT'})
        store.dispatch({type: 'INCREMENT'})
        store.dispatch({type: 'INCREMENT'})
        store.dispatch({type: 'DECREMENT'})
        store.dispatch({type: 'DECREMENT'})
        store.dispatch({type: 'DECREMENT'}).then(resolve)
      })
    })

    it('emits multiple times asynchronously', () => {
      return new Promise((resolve, reject) => {
        let expected = [1, 2]
        let n = 0

        store.on('x', (nextValue) => {
          expect(nextValue).to.equal(expected[n])

          if (++n === expected.length) {
            resolve()
          }
        })

        store.bind({
          TYPE: (_, set: Dyad.Setter, action: Dyad.Action) => {
            // XXX: Couldn’t get sinon’s fake timers to work here. With actual
            // timers, both `dispatch()` calls eventually emit events. With fake
            // timers, only the last one does. Maybe both `set()` promises
            // are resolving in the same event loop...?
            setTimeout(() => set('x', action.payload), action.payload * 2)
          }
        })

        store.dispatch({type: 'TYPE', payload: 1})
        store.dispatch({type: 'TYPE', payload: 2})
      })
    })

    it('rejects attempts to `dispatch()` from within a reducer', () => {
      return new Promise((resolve, reject) => {
        store.bind({
          TYPE: (_, set: Dyad.Setter, action: Dyad.Action) => {
            expect(() => store.dispatch({type: 'TYPE'})).to.throw('Reducers can’t dispatch actions')
            resolve()
          }
        })

        store.dispatch({type: 'TYPE'})
      })
    })

    it('rejects attempts to `dispatch()` anything but a plain object', () => {
      return new Promise((resolve, reject) => {
        store.dispatch(new Date()).then(() => {
          reject(new Error('Resolved `dispatch()` with invalid action'))
        }).catch((error: Error) => {
          if (error.message === '`action` is not a plain object') {
            resolve()
          } else {
            reject(error)
          }
        })
      })
    })

    it('rejects attempts to `dispatch()` actions without `type` property', () => {
      return new Promise((resolve, reject) => {
        store.dispatch({}).then(() => {
          reject(new Error('Resolved `dispatch()` without `type` property'))
        }).catch((error: Error) => {
          if (error.message === '`action` doesn’t include a `type` property') {
            resolve()
          } else {
            reject(error)
          }
        })
      })
    })

    it('rejects attempts to `emit()` directly', () => {
      expect(() => store.emit('x', 1)).to.throw("Can’t emit key 'x' without setting it")
    })
  })

  describe('middleware', () => {
    let clock: sinon.SinonFakeTimers | null = null

    function deferredActionMiddlware(action: any, next: Dyad.Dispatch) {
      if (action && action.meta && typeof action.meta.delay === 'number') {
        const timeoutId = setTimeout(() => next(action), action.meta.delay)
        return () => clearTimeout(timeoutId)
      }

      return next(action)
    }

    function thenableActionMiddleware(action: any, next: Dyad.Dispatch) {
      if (action && typeof action.then === 'function') {
        return action.then((r: any) => {
          const meta = Object.assign(r.meta || {}, {resolved: true})
          return store.dispatch(Object.assign(r, {meta}))
        })
      }

      return next(action)
    }

    function thunkMiddleware(action: any, next: Dyad.Dispatch) {
      return typeof action === 'function' ? action(store) : next(action)
    }

    afterEach(() => {
      if (clock) {
        clock.restore()
        clock = null
      }
    })

    it('can log actions', () => {
      let n = 0

      return new Promise((resolve) => {
        store.initialize({x: 0})

        store.use((action: any, next: Dyad.Dispatch) => {
          expect(store.get('x')).to.equal(0)
          expect(++n).to.equal(1)

          return next(action).then(() => {
            expect(store.get('x')).to.equal(1)
            expect(++n).to.equal(2)
            resolve()
          })
        })

        store.bind({
          TYPE: (_, set: Dyad.Setter, action: Dyad.Action) => set('x', 1)
        })

        store.dispatch({type: 'TYPE'})
      })
    })

    it('can defer actions', () => {
      return new Promise((resolve, reject) => {
        store.initialize({x: 0})

        store.use(deferredActionMiddlware)

        store.bind({
          X: (_, set: Dyad.Setter, action: Dyad.Action) => set('x', action.payload)
        })

        store.on('x', (nextValue) => {
          try {
            expect(Date.now() - then).to.be.at.least(5)
            expect(nextValue).to.equal(1)
            resolve()
          } catch (error) {
            reject(error)
          }
        })

        let then = Date.now()
        store.dispatch({type: 'X', payload: 1, meta: {delay: 5}}).then((cancel: any) => {
          try {
            expect(store.get('x')).to.equal(0)
            expect(typeof cancel).to.equal('function')
          } catch (error) {
            reject(error)
          }
        })
      })
    })

    it('can cancel deferred actions', () => {
      return new Promise((resolve, reject) => {
        store.initialize({x: 0})

        store.use(deferredActionMiddlware)

        store.bind({
          X: (_, set: Dyad.Setter, action: Dyad.Action) => set('x', action.payload)
        })

        store.on('x', (nextValue) => {
          try {
            expect(nextValue).to.equal(-1)
            resolve()
          } catch (error) {
            reject(error)
          }
        })

        store.dispatch({type: 'X', payload: 1, meta: {delay: 5}}).then((cancel: any) => {
          try {
            expect(store.get('x')).to.equal(0)
            expect(typeof cancel).to.equal('function')
            cancel()
          } catch (error) {
            reject(error)
          }
        })

        setTimeout(() => {
          store.dispatch({type: 'X', payload: -1}).then((action: any) => {
            try {
              expect(typeof action).to.equal('object')
            } catch (error) {
              reject(error)
            }
          })
        }, 10)
      })
    })

    it('can then actions', () => {
      return new Promise((resolve, reject) => {
        store.use(thenableActionMiddleware)

        store.bind({
          X: (_, __, action: Dyad.Action) => {
            try {
              expect(action.meta.resolved).to.be.true
              resolve()
            } catch (error) {
              reject(error)
            }
          }
        })

        store.dispatch(Promise.resolve({type: 'X'}))
      })
    })

    it('can pass non-thenable actions', () => {
      return new Promise((resolve, reject) => {
        store.use(thenableActionMiddleware)

        store.bind({
          X: (_, __, action: Dyad.Action) => {
            try {
              expect(action.meta).to.be.undefined
              resolve()
            } catch (error) {
              reject(error)
            }
          }
        })

        store.dispatch({type: 'X'})
      })
    })

    it('can thunk actions', () => {
      return new Promise((resolve, reject) => {
        store.use(thunkMiddleware)

        store.bind({
          X: (_, set: Dyad.Setter, action: Dyad.Action) => {
            set('x', 1)

            try {
              expect(typeof action).to.equal('object')
              resolve()
            } catch (error) {
              reject(error)
            }
          }
        })

        store.dispatch((store: Dyad.Store) => {
          expect(store.get('x')).to.be.undefined
          store.dispatch({type: 'X'})
        })
      })
    })

    it('can pass non-thunkable actions', () => {
      return new Promise((resolve, reject) => {
        store.use(thunkMiddleware)

        store.bind({
          X: (_, set: Dyad.Setter, action: Dyad.Action) => {
            set('x', 1)

            try {
              expect(typeof action).to.equal('object')
              resolve()
            } catch (error) {
              reject(error)
            }
          }
        })

        store.dispatch({type: 'X'}).then(() => {
          expect(store.get('x')).to.equal(1)
        })
      })
    })

    it('fails if `next()` is called multiple times', () => {
      return new Promise((resolve, reject) => {
        store.use((action: any, next: Dyad.Dispatch) => {
          next(action).then(() => next(action))
            .then(() => {
              reject(new Error('Called `next()` multiple times'))
            })
            .catch((error: Error) => {
              if (error.message === 'next() called more than once') {
                resolve()
              } else {
                reject(error)
              }
            })
        })

        store.dispatch({type: 'X'})
      })
    })
  })
})
