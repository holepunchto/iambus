'use strict'
const { test } = require('brittle')
const Iambus = require('.')

test('pub and sub', ({ plan, alike }) => {
  plan(1)

  const bus = new Iambus()

  const expected = { topic: 'news', content: 'Hello, world!' }

  bus.sub({ topic: 'news' }).on('data', (message) => {
    alike(message, expected)
  })

  bus.pub(expected)
})

test('sub opts.map function maps over data push', ({ plan, alike }) => {
  plan(1)

  const bus = new Iambus()

  const original = { topic: 'news', content: 'Hello, world!' }

  bus.sub({ topic: 'news' }, { map: (o) => ({ topic: o.topic, content: o.content.split().reverse().join() }) }).on('data', (message) => {
    const mapped = { topic: original.topic, content: original.content.split().reverse().join() }
    alike(message, mapped)
  })

  bus.pub(original)
})

test('bus.sub(\'invalid pattern\')', async ({ plan, exception }) => {
  plan(1)
  const bus = new Iambus()
  exception(() => { bus.sub('invalid pattern') })
})

test('bus.sub(pattern) - for await consume, matching and non-matching messages published', async ({ plan, alike }) => {
  plan(1)

  const bus = new Iambus()

  const matchingMessage = { topic: 'news', content: 'Hello, world!' }
  const nonMatchingMessage = { topic: 'art', content: '<^_^>' }

  setImmediate(() => {
    bus.pub(matchingMessage)
    setImmediate(() => {
      bus.pub(nonMatchingMessage)
      setImmediate(() => {
        bus.pub(matchingMessage)
      })
    })
  })

  const received = []

  for await (const message of bus.sub({ topic: 'news' })) {
    received.push(message)
    if (received.length === 2) break
  }
  alike(received, [matchingMessage, matchingMessage])
})

test('bus.sub({}) (empty pattern is catchall wildcard)', async ({ plan, alike }) => {
  plan(1)

  const bus = new Iambus()

  setImmediate(() => {
    bus.pub({ topic: 'news', content: 'Hello, world!' })
    setImmediate(() => {
      bus.pub({ topic: 'art', content: '<^_^>' })
    })
  })

  const received = []

  for await (const message of bus.sub({})) {
    received.push(message)
    if (received.length === 2) break
  }
  alike(received, [
    { topic: 'news', content: 'Hello, world!' },
    { topic: 'art', content: '<^_^>' }
  ], 'Received expected matching message')
})

test('subscribe().on(\'data\',...) with sub.destroy()', async ({ plan, is }) => {
  plan(1)
  const bus = new Iambus()
  const received = []
  const matchingMessage = { topic: 'news', content: 'Hello, world!' }
  const subscriber = bus.sub({ topic: 'news' })
  subscriber.on('data', (message) => {
    received.push(message)
  })
  bus.pub(matchingMessage)
  await new Promise(setImmediate) // skip tick for event propagation
  subscriber.destroy()
  bus.pub({ topic: 'news', content: 'will be ignored' })
  await new Promise(setImmediate) // skip tick for event propagation
  is(received.length, 1, 'succesfully unsubscribed')
})

test('multiconsumer', async ({ plan, alike }) => {
  plan(4)
  const bus = new Iambus()

  setImmediate(() => {
    bus.pub({ topic: 'news', content: 'Hello, world!' })
    setImmediate(() => {
      bus.pub({ topic: 'news', content: 'more' })
    })
  })

  const subscribe = async () => {
    let i = 0
    for await (const message of bus.sub({ topic: 'news' })) {
      if (i++ === 0) alike(message, { topic: 'news', content: 'Hello, world!' })
      else alike(message, { topic: 'news', content: 'more' })
    }
  }

  subscribe()
  subscribe()
})

test('multiconsumer (w/ backpressure)', async ({ plan, alike }) => {
  plan(8)
  const bus = new Iambus()

  setImmediate(() => {
    bus.pub({ topic: 'news', content: 'Hello, world 0' })
    bus.pub({ topic: 'news', content: 'Hello, world 1' })
    bus.pub({ topic: 'news', content: 'Hello, world 2' })
    bus.pub({ topic: 'news', content: 'Hello, world 3' })
  })

  const subscribe = async () => {
    let i = 0
    for await (const message of bus.sub({ topic: 'news' })) {
      await new Promise(setImmediate)
      alike(message, { topic: 'news', content: 'Hello, world ' + i++ })
    }
  }

  subscribe()
  subscribe()
})

test('subscriber.relay(toSubscriber) can relay replayed + live data', async ({ plan, alike, is }) => {
  plan(3)

  const bus = new Iambus()
  const subscriber = bus.sub({ topic: 'live' }, { relays: true, replay: true })
  bus.pub({ topic: 'live', content: '1st' })

  const consumer = subscriber.relay(bus.sub({ topic: 'consume' }))
  const received = []

  consumer.on('data', (msg) => {
    console.log('MSG', msg)
    received.push(msg)
    if (received.length === 2) {
      alike(received[0], { topic: 'live', content: '1st' })
      alike(received[1], { topic: 'live', content: '2nd' })
    }
  })

  await null // tick
  bus.pub({ topic: 'live', content: '2nd' })
  await null // tick
  is(received.length, 2)
})

test('replay:true buffers and replays to relayed late consumer', async ({ plan, alike }) => {
  plan(3)

  const bus = new Iambus()
  const subscriber = bus.sub({ topic: 'replay' }, { relays: true, replay: true })

  bus.pub({ topic: 'replay', content: '1st' })
  bus.pub({ topic: 'replay', content: '2nd' })

  const consumer = subscriber.relay(bus.sub({ topic: 'replay' }))
  const received = []
  consumer.on('data', msg => received.push(msg))

  await new Promise(resolve => setTimeout(resolve, 10))

  alike(received[0], { topic: 'replay', content: '1st' })
  alike(received[1], { topic: 'replay', content: '2nd' })
  alike(subscriber.buffer.length, 2)
})

test('replay:true drops oldest messages if max is reached', async ({ plan, alike }) => {
  plan(1)

  const bus = new Iambus()
  const subscriber = bus.sub({ topic: 'max' }, { relays: true, replay: true, max: 2 })

  bus.pub({ topic: 'max', content: '1st' })
  bus.pub({ topic: 'max', content: '2nd' })
  bus.pub({ topic: 'max', content: '3rd' })

  const consumer = subscriber.relay(bus.sub({ topic: 'max' }))
  const received = []

  consumer.on('data', msg => received.push(msg))
  await new Promise(resolve => setTimeout(resolve, 10))

  alike(received, [
    { topic: 'max', content: '2nd' },
    { topic: 'max', content: '3rd' }
  ])
})

test('setting subscriber.replay = false clears buffer and skips relay replay', async ({ plan, alike, is }) => {
  plan(2)

  const bus = new Iambus()
  const subscriber = bus.sub({ topic: 'cut' }, { relays: true, replay: true })

  bus.pub({ topic: 'cut', content: '1st' })
  bus.pub({ topic: 'cut', content: '2nd' })

  subscriber.replay = false

  is(subscriber.buffer.length, 0)

  const consumer = subscriber.relay(bus.sub({ topic: 'over' }))
  const received = []

  consumer.on('data', msg => received.push(msg))
  bus.pub({ topic: 'cut', content: '3rd' })

  await null // tick
  alike(received, [{ topic: 'cut', content: '3rd' }])
})

test('subscriber.relays = false disables relaying to others', async ({ plan, is }) => {
  plan(1)

  const bus = new Iambus()
  const subscriber = bus.sub({ topic: 'relay' }, { relays: true })
  const consumer = subscriber.relay(bus.sub({ topic: 'consume' }))

  subscriber.relays = false

  const received = []
  consumer.on('data', msg => received.push(msg))

  bus.pub({ topic: 'relay', content: 'hidden' })
  await new Promise(resolve => setTimeout(resolve, 10))
  is(received.length, 0)
})

test('relayed consumer removed on destroy', async ({ plan, is }) => {
  plan(2)

  const bus = new Iambus()
  const subscriber = bus.sub({ topic: 'close' }, { relays: true })
  const consumer = subscriber.relay(bus.sub({ topic: 'close' }))

  is(subscriber.subs.size, 1)

  consumer.destroy()
  await new Promise(resolve => setTimeout(resolve, 10))

  is(subscriber.subs.size, 0)
})
