'use strict'
const { test } = require('brittle')
const Iambus = require('.')

test('pub and sub, ', ({ plan, alike }) => {
  plan(1)

  const bus = new Iambus()

  const expectedMessage = { topic: 'news', content: 'Hello, world!' }

  bus.sub({ topic: 'news' }).on('data', (message) => {
    alike(message, expectedMessage, 'Received expected message')
  })

  bus.pub(expectedMessage)
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
