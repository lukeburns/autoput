const ram = require('random-access-memory')
const Hypercore = require('hypercore')
const Autobase = require('autobase')
const Autoscript = require('./autoscript')

// hyp1pj62xwrnalug2q5qpu4z5hunxhzptk2j46ftajje3phf4a4wp95rqq0lyw7
const script = `
  function main (prev, op) {
    if (!prev && op.type === 'put') {
      return [op]
    }
    throw VIOLATION
  }
`

class Autoput extends Autoscript {
  constructor (opts = {}) {
    let autobase

    if (!opts.input) {
      opts.input = [ram]
    }

    if (opts.reader === undefined) {
      opts.reader = false
    }

    if (!opts.keyEncoding) {
      opts.keyEncoding = 'utf8'
    }

    if (!opts.valueEncoding) {
      opts.valueEncoding = 'utf8'
    }

    if (opts) {
      if (opts.autobase) {
        autobase = opts.autobase
      } else {
        let input = opts.input

        if (!(input instanceof Hypercore)) {
          input = Array.isArray(input) ? input : [input]
          input = new Hypercore(...input)
        }

        const localOutput = new Hypercore(ram)
        autobase = new Autobase({
          localInput: !opts.reader ? input : null,
          localOutput,
          inputs: [input]
        })
      }
    }

    super(script, autobase, opts)
  }

  get local () {
    return this.autobase &&
      this.autobase.inputs &&
      this.autobase.inputs[0]
  }

  get key () {
    return this.local.key
  }
}

module.exports = Autoput
