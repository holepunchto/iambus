'use strict'
const assert = require('nanoassert')
const streamx = require('streamx')

class Subscriber extends streamx.PassThrough {
  #replay = false
  set replay (replay) {
    if (replay === false) this.buffer.length = 0
    return (this.#replay = replay)
  }

  get replay () {
    return this.#replay
  }

  relays = false
  relayer = null
  constructor (bus, pattern, opts) {
    super(opts)
    this.bus = bus
    this.bus.subscribers.add(this)
    this.pattern = pattern
    this.buffer = []
    this.max = opts?.max ?? 32
    this.subs = new Set()
    if (opts?.relays) this.relays = opts.relays
    if (opts?.replay) this.replay = opts.replay
    if (typeof opts?.map === 'function') this.map = opts.map
  }

  push (data) {
    if (this.map) data = this.map(data)
    if (this.replay) {
      this.buffer.push(data)
      // usage should avoid this case, but just in case, lose oldest:
      if (this.buffer.length > this.max) this.buffer.shift()
    }
    if (this.relays) for (const sub of this.subs) sub._fwd(data)
    return super.push(data)
  }

  _fwd (data) { return super.push(data) }

  relay (subscriber) {
    if (subscriber.relayer === this) return subscriber
    if (subscriber.relayer) throw new Error('Iambus: subscriber already has relayer')
    if (this.replay) for (const data of this.buffer) subscriber.push(data)
    this.subs.add(subscriber)
    subscriber.relayer = this
    subscriber.on('close', () => this.subs.delete(subscriber))
    return subscriber
  }

  pushOnMatch (message) {
    if (matchesPattern(message, this.pattern)) {
      this.push(message)
    }
  }

  end () {
    this.push(null)
  }

  _destroy (cb) {
    this.buffer.length = 0
    this.bus.subscribers.delete(this)
    cb()
  }
}

module.exports = class Iambus {
  static match = matchesPattern
  static Subscriber = Subscriber
  constructor () {
    this.subscribers = new Set()
  }

  pub (message) {
    for (const subscriber of this.subscribers) {
      subscriber.pushOnMatch(message)
    }
  }

  sub (pattern, opts) {
    assert(typeof pattern === 'object' && pattern !== null, 'Pass a pattern object: bus.sub(pattern)')
    return new Subscriber(this, pattern, opts)
  }

  destroy () {
    for (const subscriber of this.subscribers) subscriber.destroy()
  }
}

function matchesPattern (message, pattern) {
  if (typeof pattern !== 'object' || pattern === null) return false
  for (const key in pattern) {
    if (Object.hasOwn(pattern, key) === false) continue
    if (Object.hasOwn(message, key) === false) return false
    const messageValue = message[key]
    const patternValue = pattern[key]
    const nested = typeof patternValue === 'object' && patternValue !== null && typeof messageValue === 'object' && messageValue !== null
    if (nested) {
      if (matchesPattern(messageValue, patternValue) === false) return false
    } else if (messageValue !== patternValue) {
      return false
    }
  }
  return true
}
