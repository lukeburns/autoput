const EventEmitter = require('events')
const dedent = require('dedent')
const b4a = require('b4a')
const sodium = require('sodium-universal')
const bech32 = require('bcrypto/lib/encoding/bech32')
const { Isolate, Reference } = require('isolated-vm')
const DHT = require('@hyperswarm/dht')
const Hyperbee = require('hyperbee')

VIOLATION = new Error('VIOLATION')

class Autoscript extends EventEmitter {
  constructor (script, autobase, opts) {
    super()

    this.dht = new DHT()
    this.autobase = autobase
    this._witness = new EventEmitter()
    this._violation = false

    this._ready = false
    this.init(script, opts)
  }

  async init (script, opts) {
    this.script = await this.maybeAddress(script)
    this.address = encodeScript(this.script)
    // this.putScript(this.script).catch(err => {
    //   console.error('[init] put error', err)
    // })

    // todo: if fork detected, throw proof of fork
    // todo: trace violations to keys
    this.autobase.on('error', error => {
      console.error('[autobase]', error)
      this._witness.emit('error', error)
    })

    this.autobase.on('append', async input => {
      try {
        this._witness.emit('append')
      } catch (error) {
        this.emit('error', error)
        if (error.message === VIOLATION.message) {
          this._violation = true
        }
      }
    })

    this._witness.on('error', async error => {
      if (error.message === VIOLATION.message) {
        // script threw VIOLATION
        this.emit('error', error)
        this._violation = true
      } else {
        try {
          await this.witness('error', error)
        } catch (error) {
          // witness threw error (possibly VIOLATION)
          this.emit('error', error)
          if (error.message === VIOLATION.message) {
            this._violation = true
          }
        }
      }
    })

    this.autobase.start({
      unwrap: true,
      apply: this._apply.bind(this)
    })

    this.bee = new Hyperbee(this.autobase.view, {
      ...opts,
      extension: false
    })

    await this.autobase.ready()
    this._ready = true
    this.emit('ready')
  }

  ready () {
    return this._ready || new Promise(ready => this.on('ready', ready))
  }

  destroy (opts) {
    return this.dht.destroy(opts)
  }

  async witness (...args) {
    try {
      await run(this.script, 'witness', { cmp }, args)
      return true
    } catch (error) {
      if (error.message !== '') {

      }
      throw error
    }
  }

  _encode (o = {}) {
    Object.keys(o).forEach(key => {
      if (b4a.isBuffer(o[key])) {
        o[key] = o[key].toString('hex')
      }
    })
    return JSON.stringify(o)
  }

  async _apply (batch, clocks, change) {
    if (!this.script) return
    if (this._violation) throw VIOLATION

    const view = this.bee.batch({ update: false })

    for (const node of batch) {
      if (this._violation) throw VIOLATION
      const seq = node.seq
      const next = JSON.parse(node.value.toString())
      const prev = await view.get(next.key, { update: false })

      next.change = node.change.toString('hex')
      next.seq = node.seq

      const nextCore = this.autobase._inputsByKey.get(next.change)
      next.fork = nextCore.fork

      if (prev && prev.value) {
        Object.assign(prev, JSON.parse(prev.value))
        const prevCore = this.autobase._inputsByKey.get(prev.change)
        prev.fork = prevCore.fork
      }

      const ops = await run(this.script, 'main', { cmp }, [prev, next, clocks])
        .catch(error => this._witness.emit('error', error)) || []

      if (Array.isArray(ops)) {
        for (const op of ops) {
          if (this._violation) return
          const { type, key, value } = op
          try {
            const val = this._encode({ value, change, seq })
            await view[type](key, val)
          } catch (error) {
            console.error('[apply] could not apply op', type)
          }
        }
      }
    }

    return await view.flush()
  }

  async put (key, value, opts) {
    if (this._violation) throw VIOLATION
    const op = Buffer.from(JSON.stringify({ type: 'put', key, value }))
    return await this.autobase.append(op, opts)
  }

  async del (key, opts) {
    if (this._violation) throw VIOLATION
    const op = Buffer.from(JSON.stringify({ type: 'del', key }))
    return await this.autobase.append(op, opts)
  }

  async get (key) {
    const node = await this.bee.get(key)
    if (!node) return null
    node.value = JSON.parse(node.value).value
    return node
  }

  async maybeAddress (script, options) {
    const node = this.dht
    if (script.length === 63) {
      try {
        const [hrp, version, hash] = bech32.decode(script)
        try {
          const { value } = await node.immutableGet(hash, options)
          return value.toString()
        } catch (error) {
          throw error
        }
      } catch (error) {} // if not valid bech32, treat as script
    }
    try {
      return dedent(script)
    } catch (error) {
      throw error
    }
  }

  async putScript (script, options) {
    const node = this.dht
    if (typeof script === 'string') {
      script = b4a.from(script)
    }
    const { hash } = await node.immutablePut(script, options)
    return hash
  }
}

module.exports = Autoscript

async function run (script, name, inject, args = [], self) {
  const isolate = new Isolate({ memoryLimit: 128 })
  const context = await isolate.createContext()

  const global = context.global
  global.setSync('VIOLATION', VIOLATION, { copy: true })
  global.setSync('exports', global.derefInto())
  global.setSync('log', function (...args) {
    console.log(...args)
  })
  Object.keys(inject).forEach(key => {
    if (typeof inject[key] === 'function') {
      global.setSync(key, inject[key])
    } else {
      global.setSync(key, inject[key], { copy: true })
    }
  })

  const program = await isolate.compileScript(script)
  try {
    await program.run(context)
  } catch (error) {
    this.emit('error', error => console.log('[program]', error))
  }
  const fn = await global.get(name, { reference: true })
  const result = await fn.apply(new Reference(self), args, {
    arguments: {
      copy: true
    },
    result: {
      promise: true,
      copy: true
    }
  })
  return result
}

// ok forks are complicating business.
function cmp (clock, A, B) {
  if (A && B) {
    const Aseq = clock.has(A.change) ? clock.get(A.change) : 0
    const Bseq = clock.has(B.change) ? clock.get(B.change) : 0
    if (Aseq > A.seq) {
      // this currently gives me -1 _anytime_ there have been global ops
      return -1
    }
    if (Aseq < A.seq) {
      return +1
    }
  }

  return 0
}

function hashScript (script) {
  if (typeof script === 'string') {
    script = b4a.from(script)
  }
  const target = b4a.allocUnsafe(32)
  sodium.crypto_generichash(target, script)
  return target
}

function encodeScript (script) {
  const hash = hashScript(script)
  return encodeHash(hash)
}

function encodeHash (hash) {
  return bech32.encode('hyp', 1, hash)
}
