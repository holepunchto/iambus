'use strict'
const assert = require('nanoassert')
const streamx = require('streamx')
const FALLBACK_CUTOVER_DELAY = 180_000 // 3 minutes

class Subscriber extends streamx.PassThrough {
  _timeout = null

  constructor (bus, pattern, opts = {}) {
    super(opts)
    this.bus = bus
    this.bus.subscribers.add(this)
    this.pattern = pattern
    this.queue = []
    this.max = opts.max ?? 32
    this.retain = opts.retain ?? false
    if (this.retain) this.cutover(FALLBACK_CUTOVER_DELAY)
    this.opts = opts
    if (typeof opts.map === 'function') this.map = opts.map
  }

  _cutover = (after) => {
    this.queue.length = 0
    clearTimeout(this._timeout)
    this._timeout = null
    this.off('close', this._cutover)
    this.emit('cutover', after)
  }

  cutover (after = 0) {
    if (this._timeout !== null) {
      clearTimeout(this._timeout)
      this._timeout = null
      this.off('close', this._cutover)
    }
    this._timeout = setTimeout(this._cutover, after, after)
    this.once('close', this._cutover)
  }

  feed (subscriber) {
    for (const message of this.queue) {
      subscriber.pushOnMatch(message)
    }
    return subscriber
  }

  push (message) {
    if (this.map) message = this.map(message)
    if (this.retain) {
      this.queue.push(message)
      // usage should avoid this case, but just in case, lose oldest:
      if (this.queue.length > this.max) this.queue.shift()
    }
    return super.push(message)
  }

  pushOnMatch (message) {
    if (match(message, this.pattern)) {
      this.push(message)
    }
  }

  end () {
    this.push(null)
  }

  _destroy (cb) {
    this.bus.subscribers.delete(this)
    this.once('cutover', cb)
    this.cutover()
  }
}

module.exports = class Iambus {
  static match = match
  static Subscriber = Subscriber
  constructor ({ onsub = () => {} } = {}) {
    this.subscribers = new Set()
    this._onsub = onsub
  }

  pub (message) {
    for (const subscriber of this.subscribers) {
      subscriber.pushOnMatch(message)
    }
  }

  sub (pattern = {}, opts) {
    assert(typeof pattern === 'object' && pattern !== null, 'Pass a pattern object: bus.sub(pattern)')
    const subscriber = new Subscriber(this, pattern, opts)
    this._onsub(subscriber)
    return subscriber
  }

  destroy () {
    for (const subscriber of this.subscribers) subscriber.destroy()
  }
}

function match (message, pattern) {
  if (typeof pattern !== 'object' || pattern === null) return false
  for (const key in pattern) {
    if (Object.hasOwn(pattern, key) === false) continue
    if (Object.hasOwn(message, key) === false) return false
    const messageValue = message[key]
    const patternValue = pattern[key]
    const nested = typeof patternValue === 'object' && patternValue !== null && typeof messageValue === 'object' && messageValue !== null
    if (nested) {
      if (match(messageValue, patternValue) === false) return false
    } else if (messageValue !== patternValue) {
      return false
    }
  }
  return true
}
