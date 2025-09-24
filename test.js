'use strict'
const { test } = require('brittle')
const Iambus = require('.')

test('pub and sub', ({ plan, alike, teardown }) => {
  plan(1)

  const bus = new Iambus()
  teardown(() => { bus.destroy() })
  const expected = { topic: 'news', content: 'Hello, world!' }

  bus.sub({ topic: 'news' }).on('data', (message) => {
    alike(message, expected)
  })

  bus.pub(expected)
})

test('bus.sub(\'invalid pattern\')', async ({ plan, exception, teardown }) => {
  plan(1)
  const bus = new Iambus()
  teardown(() => { bus.destroy() })

  exception(() => { bus.sub('invalid pattern') })
})

test('bus.sub(pattern) - for await consume, matching and non-matching messages published', async ({ plan, alike, teardown }) => {
  plan(1)

  const bus = new Iambus()
  teardown(() => { bus.destroy() })

  const matchingMessage = { topic: 'news', content: 'Hello, world!' }
  const nonMatchingMessage = { topic: 'art', content: '<^_^>' }
  const sub = bus.sub({ topic: 'news' })
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

  for await (const message of sub) {
    received.push(message)
    if (received.length === 2) break
  }

  alike(received, [matchingMessage, matchingMessage])
})

test('bus.sub({}) (empty pattern is catchall wildcard)', async ({ plan, alike, teardown }) => {
  plan(1)

  const bus = new Iambus()
  teardown(() => { bus.destroy() })

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

test('subscribe().on(\'data\',...) with sub.destroy()', async ({ plan, is, pass, teardown }) => {
  plan(2)
  const bus = new Iambus()

  const received = []
  const matchingMessage = { topic: 'news', content: 'Hello, world!' }
  const subscriber = bus.sub({ topic: 'news' })
  subscriber.on('data', (message) => {
    received.push(message)
  })
  bus.pub(matchingMessage)
  await new Promise(setImmediate) // skip tick for event propagation
  subscriber.on('close', () => { pass('close') })
  subscriber.destroy()
  bus.pub({ topic: 'news', content: 'will be ignored' })
  await new Promise(setImmediate) // skip tick for event propagation
  is(received.length, 1, 'succesfully unsubscribed')
})

test('multiconsumer', async ({ plan, alike, teardown }) => {
  plan(4)
  const bus = new Iambus()
  teardown(() => { bus.destroy() })

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
      if (i === 2) break
    }
  }

  subscribe()
  subscribe()
})

test('multiconsumer (w/ backpressure)', async ({ plan, alike, teardown }) => {
  plan(8)
  const bus = new Iambus()
  teardown(() => { bus.destroy() })

  setImmediate(() => {
    bus.pub({ topic: 'news', content: 'Hello, world 0' })
    bus.pub({ topic: 'news', content: 'Hello, world 1' })
    bus.pub({ topic: 'news', content: 'Hello, world 2' })
    bus.pub({ topic: 'news', content: 'Hello, world 3' })
  })

  const subscribe = async () => {
    let i = 0
    const sub = bus.sub({ topic: 'news' })
    for await (const message of sub) {
      await new Promise(setImmediate)
      alike(message, { topic: 'news', content: 'Hello, world ' + i++ })
      if (i === 4) break
    }
  }

  subscribe()
  subscribe()
})

test('subscriber.feed(toSubscriber) consumes data from subscriber queue', async ({ plan, alike, is, teardown }) => {
  plan(3)

  const bus = new Iambus()
  teardown(() => { bus.destroy() })

  const subscriber = bus.sub({ topic: 'live' }, { retain: true })
  bus.pub({ topic: 'live', content: '1st' })
  const consumer = bus.sub({ topic: 'live' })
  subscriber.feed(consumer)
  const received = []

  consumer.on('data', (msg) => {
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

test('retain:true drops oldest messages if max is reached', async ({ plan, alike, teardown }) => {
  plan(1)

  const bus = new Iambus()
  teardown(() => { bus.destroy() })
  const subscriber = bus.sub({ topic: 'max' }, { retain: true, max: 2 })

  bus.pub({ topic: 'max', content: '1st' })
  bus.pub({ topic: 'max', content: '2nd' })
  bus.pub({ topic: 'max', content: '3rd' })

  const consumer = subscriber.feed(bus.sub({ topic: 'max' }))
  const received = []
  console.log('huwhut')
  consumer.on('data', msg => received.push(msg))
  await new Promise(resolve => setTimeout(resolve, 10))

  alike(received, [
    { topic: 'max', content: '2nd' },
    { topic: 'max', content: '3rd' }
  ])
})

test('subscriber.cutover() clears the queue', async ({ plan, alike, is, teardown }) => {
  plan(2)

  const bus = new Iambus()
  teardown(() => { bus.destroy() })
  const subscriber = bus.sub({ topic: 'cutover' }, { retain: true })

  bus.pub({ topic: 'cutover', content: '1st' })
  bus.pub({ topic: 'cutover', content: '2nd' })

  subscriber.cutover()
  await new Promise((resolve) => setTimeout(resolve, 1)) // default cutover after 0ms timeout
  is(subscriber.queue.length, 0)

  const consumer = subscriber.feed(bus.sub({ topic: 'cutover' }))
  const received = []

  consumer.on('data', msg => received.push(msg))
  bus.pub({ topic: 'cutover', content: '3rd' })

  await null // tick
  alike(received, [{ topic: 'cutover', content: '3rd' }])
})

test('subscriber.cutover(after = T)', async ({ plan, alike, is, teardown }) => {
  plan(3)

  const bus = new Iambus()
  teardown(() => { bus.destroy() })
  const subscriber = bus.sub({ topic: 'cutover' }, { retain: true })

  bus.pub({ topic: 'cutover', content: '1st' })
  bus.pub({ topic: 'cutover', content: '2nd' })

  subscriber.cutover(10)
  await new Promise((resolve) => setTimeout(resolve, 1))
  is(subscriber.queue.length, 2)
  await new Promise((resolve) => setTimeout(resolve, 10))
  is(subscriber.queue.length, 0)

  const consumer = subscriber.feed(bus.sub({ topic: 'cutover' }))
  const received = []

  consumer.on('data', msg => received.push(msg))
  bus.pub({ topic: 'cutover', content: '3rd' })

  await null // tick
  alike(received, [{ topic: 'cutover', content: '3rd' }])
})

test('subscriber.cutover() emits cutover event', async ({ plan, alike, is, teardown }) => {
  plan(3)

  const bus = new Iambus()
  teardown(() => { bus.destroy() })
  const subscriber = bus.sub({ topic: 'cutover' }, { retain: true })
  bus.pub({ topic: 'cutover', content: '1st' })
  bus.pub({ topic: 'cutover', content: '2nd' })
  subscriber.once('cutover', (after) => is(after, 2))
  subscriber.cutover(2)
  await new Promise((resolve) => setTimeout(resolve, 3)) // cutover after 2ms timeout
  is(subscriber.queue.length, 0)

  const consumer = subscriber.feed(bus.sub({ topic: 'cutover' }))
  const received = []

  consumer.on('data', msg => received.push(msg))
  bus.pub({ topic: 'cutover', content: '3rd' })

  await null // tick
  alike(received, [{ topic: 'cutover', content: '3rd' }])
})
