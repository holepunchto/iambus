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
import Iambus from 'iambus'

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

```
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
2nd subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
done
```

## Relaying & Replaying

For situations where a subscriber multiple consumers there's the `relays` option.

Pass `relays:true` and then use the `subscriber.relay(subscriber)` method to relay to another subscriber.

```js
import Iambus from 'iambus'

const bus = new Iambus()

setImmediate(() => {
  bus.pub({ match: 'this', and: { also: 'this' }, content: 'Hello, world!' })
  setImmediate(() => {
    bus.pub({ match: 'this', and: { also: 'this' }, content: 'more content' })
    setImmediate(() => {
      bus.pub({ match: 'this', and: { also: 'this' }, content: 'even more content' })
    })
  })
})

const subscriber = bus.sub({ match: 'this', and: { also: 'this' } }, { relays: true })
const consumerA = subscriber.relay(bus.sub({ another: 'pattern'}))
const consumerB = subscriber.relay(bus.sub({ relays: 'regardless'}))

subscriber.on('data', (data) => console.log('Subscriber got', data) )
consumerA.on('data', (data) => console.log('ConsumerA got', data) )
consumerB.on('data', (data) => console.log('ConsumerB got', data) )
```

should output:

```
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'even more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
```

For cases where multiple consumers don't all begin consuming at the same time yet need to consume all of the same data the `replay` option can be used alongside the `relays` option.

**Without** the `replay` option the following:

```js
import Iambus from 'iambus'
const bus = new Iambus()

setImmediate(() => {
  bus.pub({ match: 'this', and: { also: 'this' }, content: 'Hello, world!' })
  setImmediate(() => {
    bus.pub({ match: 'this', and: { also: 'this' }, content: 'more content' })
    setImmediate(() => {
      bus.pub({ match: 'this', and: { also: 'this' }, content: 'even more content' })
    })
  })
})

const subscriber = bus.sub({ match: 'this', and: { also: 'this' } }, { relays: true })
const consumerA = subscriber.relay(subscriber.relay(bus.sub({ another: 'pattern'})))
setTimeout(() => {
  const consumerB = subscriber.relay(subscriber.relay(bus.sub({ relays: 'regardless'})))
  consumerB.on('data', (data) => console.log('ConsumerB got', data) )
}, 1000)


subscriber.on('data', (data) => console.log('Subscriber got', data) )
consumerA.on('data', (data) => console.log('ConsumerA got', data) )
```

Would output:

```
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'even more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
```

**With** the `replay` option, data is buffered internally and replayed:

```js
import Iambus from 'iambus'

const bus = new Iambus()

setImmediate(() => {
  bus.pub({ match: 'this', and: { also: 'this' }, content: 'Hello, world!' })
  setImmediate(() => {
    bus.pub({ match: 'this', and: { also: 'this' }, content: 'more content' })
    setImmediate(() => {
      bus.pub({ match: 'this', and: { also: 'this' }, content: 'even more content' })
    })
  })
})

const subscriber = bus.sub({ match: 'this', and: { also: 'this' } }, { relays: true, replay: true })
const consumerA = subscriber.relay(subscriber.relay(bus.sub({ another: 'pattern'})))
setTimeout(() => {
  const consumerB = subscriber.relay(subscriber.relay(bus.sub({ relays: 'regardless'})))
  consumerB.on('data', (data) => console.log('ConsumerB got', data) )
}, 1000)


subscriber.on('data', (data) => console.log('Subscriber got', data) )
consumerA.on('data', (data) => console.log('ConsumerA got', data) )

```

Which will output

```
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'even more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'even more content' }
```

The oldest message will be removed if the amount of buffered messages exceeds `opts.max`, which defaults to 32.

So setting `max:2` like so:

```js
import Iambus from 'iambus'
const bus = new Iambus()

setImmediate(() => {
  bus.pub({ match: 'this', and: { also: 'this' }, content: 'Hello, world!' })
  setImmediate(() => {
    bus.pub({ match: 'this', and: { also: 'this' }, content: 'more content' })
    setImmediate(() => {
      bus.pub({ match: 'this', and: { also: 'this' }, content: 'even more content' })
    })
  })
})

const subscriber = bus.sub({ match: 'this', and: { also: 'this' } }, { relays: true, replay: true, max: 2 })
const consumerA = subscriber.relay(subscriber.relay(bus.sub({ another: 'pattern'})))
setTimeout(() => {
  const consumerB = subscriber.relay(subscriber.relay(bus.sub({ relays: 'regardless'})))
  consumerB.on('data', (data) => console.log('ConsumerB got', data) )
}, 1000)


subscriber.on('data', (data) => console.log('Subscriber got', data) )
consumerA.on('data', (data) => console.log('ConsumerA got', data) )

```

Will output

```
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'even more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'even more content' }
```

Note the missing "Hello world" message for ConsumerB.


Setting `subscriber.replay` to `false` clears the buffer and stops buffering:

```js
import Iambus from 'iambus'
const bus = new Iambus()

setImmediate(() => {
  bus.pub({ match: 'this', and: { also: 'this' }, content: 'Hello, world!' })
  setImmediate(() => {
    bus.pub({ match: 'this', and: { also: 'this' }, content: 'more content' })
    setTimeout(() => {
      bus.pub({ match: 'this', and: { also: 'this' }, content: 'even more content' })
    }, 1500)
  })
})

const subscriber = bus.sub({ match: 'this', and: { also: 'this' } }, { relays: true, replay: true})
const consumerA = subscriber.relay(subscriber)
setTimeout(() => {
  const consumerB = subscriber.relay(subscriber)
  consumerB.on('data', (data) => console.log('ConsumerB got', data) )
}, 1000)


subscriber.on('data', (data) => console.log('Subscriber got', data) )
consumerA.on('data', (data) => console.log('ConsumerA got', data) )

subscriber.replay = false
```

Will output:

```js
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'even more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
```

Note that ConsumerB does receive the last message, this is becuase it's sent 500ms after the 1000ms timeout, so it's not replayed, it's just relays.

Relaying can also be stopped by setting `subscriber.relays` to `false`:ing

```js
import Iambus from 'iambus'
const bus = new Iambus()

setImmediate(() => {
  bus.pub({ match: 'this', and: { also: 'this' }, content: 'Hello, world!' })
  subscriber.relays = false
  setImmediate(() => {
    bus.pub({ match: 'this', and: { also: 'this' }, content: 'more content' })
    setTimeout(() => {
      subscriber.relays = true
      bus.pub({ match: 'this', and: { also: 'this' }, content: 'even more content' })
    }, 1500)
  })
})

const subscriber = bus.sub({ match: 'this', and: { also: 'this' } }, { relays: true})
const consumerA = subscriber.relay(subscriber)

const consumerB = subscriber.relay(subscriber)
consumerB.on('data', (data) => console.log('ConsumerB got', data) )


subscriber.on('data', (data) => console.log('Subscriber got', data) )
consumerA.on('data', (data) => console.log('ConsumerA got', data) )

```

This will output:

```
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'even more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
```

Note how only Subscriber got "more content", relays was turned off and then on, before and after that message was sent.


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
