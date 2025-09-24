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
  break // triggers destroy()
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

### Subscribing to all messages

An empty pattern object can be used to subscribe to all messages on the bus:

```js
async function msglogger () {
  for await (const message of bus.sub({})) console.log('BUS MSG', Date.now(), ' - ', message)
}
msglogger().catch(console.error)
```


## Retain - `bus.sub(pattern, { [ retain = false ] })`

For situations where a subscriber multiple consumers there's the `relays` option.

Pass `retain:true` and then use the `fromSubscriber.feed(toSubscriber)` method to relay to another subscriber.

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

const subscriber = bus.sub({ match: 'this', and: { also: 'this' } }, { retain: true })
const consumerA = subscriber.feed(bus.sub({ match: 'this'}))
const consumerB = subscriber.feed(bus.sub({ and: { also: 'this' } }))

subscriber.on('data', (data) => console.log('Subscriber got', data) )
consumerA.on('data', (data) => console.log('ConsumerA got', data) )
consumerB.on('data', (data) => console.log('ConsumerB got', data) )
```

should output:

```
Subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'even more content' }
```

The oldest message will be removed if the amount of queued messages exceeds `opts.max`, which defaults to 32.

Passing the `retain` option as true automatically triggers a cutover (clears the queue) after three minutes.

## Queue Limiting - `bus.sub(pattern, { [ retain = false ], [ max = 32 ] })`

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

const subscriber = bus.sub({ match: 'this', and: { also: 'this' } }, { retain: true, max: 2 })
const consumerA = subscriber.feed(bus.sub({ match: 'this'}))
setTimeout(() => {
  const consumerB = subscriber.feed(bus.sub({ and: { also: 'this' } }))
  consumerB.on('data', (data) => console.log('ConsumerB got', data) )
}, 1000)


subscriber.on('data', (data) => console.log('Subscriber got', data) )
consumerA.on('data', (data) => console.log('ConsumerA got', data) )
consumerB.on('data', (data) => console.log('ConsumerB got', data) )

```

Will output

```
Subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'even more content' }
```

Note the missing "Hello world" message for ConsumerB.

## Cutover - `subscriber.cutover(after = 0)`

Calling `subscriber.cutover()` clears the queue and stops retaining. 

This should be called if `opts.retain` is set to `true`.

```js
import Iambus from 'iambus'

const bus = new Iambus()

setImmediate(() => {
  bus.pub({ match: 'this', and: { also: 'this' }, content: 'Hello, world!' })
  setImmediate(() => {
    bus.pub({ match: 'this', and: { also: 'this' }, content: 'more content' })
    subscriber.cutover()
    setTimeout(() => {
      bus.pub({ match: 'this', and: { also: 'this' }, content: 'even more content' })
    }, 1500)
  })
})

const subscriber = bus.sub({ match: 'this', and: { also: 'this' } }, { retain: true })
const consumerA = subscriber.feed(bus.sub({ match: 'this' }))
setTimeout(() => {
  const consumerB = subscriber.feed(bus.sub({ and: { also: 'this' } }))
  consumerB.on('data', (data) => console.log('ConsumerB got', data))
}, 1000)


subscriber.on('data', (data) => console.log('Subscriber got', data))
consumerA.on('data', (data) => console.log('ConsumerA got', data))
```

Will output:

```js
Subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'even more content' }
```

Note that ConsumerB only recieves the last message, because cutover occurs before it subscribes so by then the queue is empty. 

Cutover can occur after a delay by passing an argument representing milliseonds until cutover:

```js
import Iambus from 'iambus'

const bus = new Iambus()

setImmediate(() => {
  bus.pub({ match: 'this', and: { also: 'this' }, content: 'Hello, world!' })
  setImmediate(() => {
    bus.pub({ match: 'this', and: { also: 'this' }, content: 'more content' })
    subscriber.cutover(1501)
    setTimeout(() => {
      bus.pub({ match: 'this', and: { also: 'this' }, content: 'even more content' })
    }, 1500)
  })
})

const subscriber = bus.sub({ match: 'this', and: { also: 'this' } }, { retain: true })
const consumerA = subscriber.feed(bus.sub({ match: 'this' }))
setTimeout(() => {
  const consumerB = subscriber.feed(bus.sub({ and: { also: 'this' } }))
  consumerB.on('data', (data) => console.log('ConsumerB got', data))
}, 1000)


subscriber.on('data', (data) => console.log('Subscriber got', data))
consumerA.on('data', (data) => console.log('ConsumerA got', data))
```

This will output:

```
Subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'more content' }
Subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerA got { match: 'this', and: { also: 'this' }, content: 'even more content' }
ConsumerB got { match: 'this', and: { also: 'this' }, content: 'even more content' }
```

The cutover happens after the final pub, so ConsumerB get's all messages.

The `subscriber` will also emit a `cutover` event once cutover occurs.

The `subcriber.cutover()` function may be called multiple times, the latest method call determines the outcome. This can be useful for strategies involving a delay fallback to cutover while allowing cutover to occur prior based on heuristics or manual calls - i.e. first call `subscriber.cutover(delay)` then later call `subscriber.cutover()` to cutover prior to the delay.

## `Iambus.match(message, pattern) -> boolean` 

Returns `true` if pattern matches message, `false` if not.


## Example

The [example.mjs](./example.mjs) file contains three subscribers and the message logger
that uses an empty pattern to subscribe to all messages. 

```
node example.mjs
```

Should output:

```sh
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
2nd subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
2nd subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
2nd subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
3rd subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
3rd subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
3rd subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
```

```
node example.mjs --log
```

Should output similar to:

```sh
BUS MSG 2025-09-23T18:09:00.584Z - { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
BUS MSG 2025-09-23T18:09:00.596Z - { something: 'else', whatever: 'that might be' }
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
BUS MSG 2025-09-23T18:09:00.596Z - { match: 'this', and: { also: 'this' }, content: 'more content' }
BUS MSG 2025-09-23T18:09:00.597Z - { match: 'this', and: { also: 'this' }, content: 'even more content' }
1st subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
2nd subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
2nd subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
2nd subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
3rd subscriber got { match: 'this', and: { also: 'this' }, content: 'Hello, world!' }
3rd subscriber got { match: 'this', and: { also: 'this' }, content: 'more content' }
3rd subscriber got { match: 'this', and: { also: 'this' }, content: 'even more content' }
```

## License

Apache License 2.0. See the [LICENSE](./LICENSE) file for more details.
