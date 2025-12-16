import Iambus from './index.js'

// run with --log to enable logging of all bus messages

const bus = new Iambus()
const log = process.argv.includes('--log')

async function msglogger() {
  for await (const message of bus.sub({})) console.log('BUS MSG', new Date(), '-', message)
}

if (log) msglogger().catch(console.error)

setImmediate(() => {
  bus.pub({ match: 'this', and: { also: 'this' }, content: 'Hello, world!' })
  setImmediate(() => {
    bus.pub({ something: 'else', whatever: 'that might be' })
    bus.pub({ match: 'this', and: { also: 'this' }, content: 'more content' })
    setImmediate(() => {
      bus.pub({
        match: 'this',
        and: { also: 'this' },
        content: 'even more content'
      })
    })
  })
})

const sub1 = bus.sub({ match: 'this' })
const sub2 = bus.sub({ and: { also: 'this' } })
const sub3 = bus.sub({ and: { also: 'this' } })
const counts = [0, 0, 0]

for await (const message of sub1) {
  console.log('1st subscriber got', message)
  if (++counts[0] === 3) break // destroy
}

for await (const message of sub2) {
  console.log('2nd subscriber got', message)
  if (++counts[1] === 3) break // destroy
}

sub3.on('data', (message) => {
  console.log('3rd subscriber got', message)
  if (++counts[2] === 3) sub3.destroy()
})
