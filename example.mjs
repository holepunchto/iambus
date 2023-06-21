import Iambus from './index.js'

// run with --log to enable logging of all bus messages

const bus = new Iambus()

let count = 0
const log = process.argv.includes('--log')

async function msglogger () {
  for await (const message of bus.sub({})) console.log('BUS MSG', new Date(), '-', message)
}

if (log) msglogger().catch(console.error)

setImmediate(() => {
  bus.pub({ match: 'this', and: { also: 'this' }, content: 'Hello, world!' })
  setImmediate(() => {
    bus.pub({ something: 'else', whatever: 'that might be' })
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
