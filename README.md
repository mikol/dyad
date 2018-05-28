# Dyad

Store app state as key-value pairs.

Update state using a reactive `(state, action) => state` pattern.

Listen for changes to a key; get notified if-and-only-if it changes (never when
another key changes).

## Installation

```
npm install dyad
```

## Usage

```js
import * as Dyad from 'dyad'

const store = Dyad.getInstance()

// Set initial `counter` state.
store.initialize({counter: 0})

// Register listener for changes to `counter`.
store.on('counter', (nextValue) => {
  console.log(nextValue)
})

// Register reducers.
store.bind({
  DECREMENT: (_, set, action) => set('counter', (prevValue) => --prevValue)
  INCREMENT: (_, set, action) => set('counter', (prevValue) => ++prevValue)
})

// Dispatch actions.
store.dispatch({type: 'INCREMENT'})
store.dispatch({type: 'INCREMENT'})
store.dispatch({type: 'INCREMENT'})
store.dispatch({type: 'DECREMENT'})
store.dispatch({type: 'DECREMENT'})

// Logs `1` exactly once.
```
