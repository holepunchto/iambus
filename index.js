'use strict'
const assert = require('nanoassert')
const { Readable } = require('streamx')

module.exports = class Iambus {
  constructor () {
    this.subscribers = new Set()
  }

  pub (message) {
    for (const subscriber of this.subscribers) subscriber.pushOnMatch(message)
  }

  sub (pattern, opts) {
    assert(typeof pattern === 'object' && pattern !== null, 'Pass a pattern object: bus.sub(pattern)')
    return new Subscriber(this, pattern, opts)
  }

  destroy () {
    for (const subscriber of this.subscribers) subscriber.destroy()
  }
}

class Subscriber extends Readable {
  constructor (bus, pattern, opts) {
    super(opts)
    this.bus = bus
    this.bus.subscribers.add(this)
    this.pattern = pattern
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
    this.bus.subscribers.delete(this)
    cb()
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
