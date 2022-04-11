const test = require('brittle')
const ram = require('random-access-memory')
const Hypercore = require('hypercore')
const Autobase = require('autobase')
const Autoput = require('.')

test('violation', async t => {
  const writer = new Autoput()
  await writer.put('0', 'a')
  await writer.put('0', 'a*')

  writer.once('error', error => {
    t.is('VIOLATION', error.message, 'violation works')
  })

  await writer.get('0')
  writer.destroy()
})

test('violation with reader', async t => {
  t.plan(2)

  const writer = new Autoput()
  await writer.ready()

  const reader = new Autoput({
    reader: true,
    input: new Hypercore(ram, writer.key)
  })
  await reader.ready()

  console.log('script address:', writer.address)
  console.log('key:', reader.key.toString('hex'))

  // replicate
  const r = reader.local.replicate(true)
  const w = writer.local.replicate(false)
  r.pipe(w).pipe(r)

  // todo: obstruct writer from overwriting by accident
  await writer.put('0', 'a')
  await writer.put('0', 'a*')

  // wait for replication
  setImmediate(async () => {
    reader.once('error', error => {
      t.is('VIOLATION', error.message, 'violation works')
    })

    const res = await reader.get('0')
    t.is('a', res.value, 'get works')

    await writer.destroy()
    await reader.destroy()

    t.end()
  })
})
