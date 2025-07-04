# iambus

> minimalist pattern-matching pub-sub message-bus

## Installation

Install using npm:

```bash
npm install iambus
```

## Creating a bus

```js
const Iambus = require('iambus')

const bus = new Iambus()
```

## Publishing Messages

Messages should be objects. To publish a message to the bus, use the `pub` method:

```js
const message = {
  topic: 'news',
  content: 'Hello, world!'
}

bus.pub(message)
```

## Subscribing & Unsubscribing

Subscribers are Readable [streamx](https://npmjs.com/package/streamx) streams. 

Subscribe to a pattern (an object which partially matches against target messages).

To subscribe to messages pass a pattern object to the `sub` method:

```js
const pattern= { topic: 'news' }
const subscriber = bus.sub(pattern)
```

The pattern object must deeply-equal properties in a published message to match (but does not need to match all properties).

When in async contexts (such as async functions or top-level ESM), a `for await...of` loop can be used to listen for messages:

```js
for await (const message of subscriber) {
  console.log('Received one message:', message)
  break
}
```

To unsubscribe, destroy the stream. The usage of `break` in the `for await` loop causes the `subscriber` stream to be destroyed. Exiting the loop via `return` also causes the `subscriber` stream to be destroyed.

Here's an equivalent example with the `data` event and `destroy` method:

```js
// Listen for messages using 'data' event
subscriber.on('data', (message) => {
  console.log('Received one message:', message)
  subscriber.destroy()
})
```

A graceful stream close is also possible with the `end` method:

```js
// Listen for messages using 'data' event
subscriber.on('data', (message) => {
  console.log('Received one message:', message)
  subscriber.end()
})
```

### Subscribing to all messages

An empty pattern object can be used to subscribe to all messages on the bus:

```js
async function msglogger () {
  for await (const message of bus.sub({})) console.log('BUS MSG', Date.now(), ' - ', message)
}
msglogger().catch(console.error)
```

## Resubscribing
 
To resubscribe create a new subscriber using `bus.sub(pattern)`. 

```js
import Iambus from './index.js'

const bus = new Iambus()

let count = 0

setImmediate(() => {
  bus.pub({ match: 'this', and: { also: 'this' }, content: 'Hello, world!' })
  setImmediate(() => {
    bus.pub({ match: 'this', and: { also: 'this' }, content: 'more content' })
    setImmediate(() => {
      bus.pub({ match: 'this', and: { also: 'this' }, content: 'even more content' })
    })
  })
})

for await (const message of bus.sub({ match: 'this', and: { also: 'this' } })) {
  console.log('1st subscriber got', message)
  if (++count === 2) break // destroy
}

for await (const message of bus.sub({ match: 'this', and: { also: 'this' } })) {
  console.log('2nd subscriber got', message)
  if (++count === 3) break // destroy
}

console.log('done')
```

This should output:

```sh
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
2nd subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
done
```

## `Iambus.match(message, pattern) -> boolean` 

Returns `true` if pattern matches message, `false` if not.

## Example

The [example.mjs](./example.mjs) file contains both the resubscribing code and the message logger
that uses an empty pattern to subscribe to all messages. 

```
node example.mjs
```

Should output:

```sh
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
2nd subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
done
```

```
node example.mjs --log
```

Should output similar to:

```sh
BUS MSG 2023-06-21T15:25:32.897Z - { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
BUS MSG 2023-06-21T15:25:32.901Z - { something: 'else', whatever: 'that might be' }
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
BUS MSG 2023-06-21T15:25:32.901Z - { match: 'this', and: { also: 'this' }, content: 'more content' }
BUS MSG 2023-06-21T15:25:32.902Z - { match: 'this', and: { also: 'this' }, content: 'even more content' }
2nd subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
done
```

## License

Apache License 2.0. See the [LICENSE](./LICENSE) file for more details.
