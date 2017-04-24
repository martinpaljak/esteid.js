'use strict'

var trace = false
var pcsc = require('pcsclite')()

// Returns a function that accepts APDU-s and return promises
// that resolve to responses
function transmit (reader, protocol) {
  var proto = 'T=?'
  if (protocol === 1) { proto = 'T=0' } else if (protocol === 2) { proto = 'T=1' }

  return function (apdu) {
    return new Promise(function (resolve, reject) {
      if (trace) { console.log('SEND (%s): %s', proto, apdu.toString('hex')) }
      reader.transmit(apdu, 4096, protocol, function (err, data) {
        if (err) {
          if (trace) { console.log('RECV: ' + err.message) }
          return reject(new Error('Transmit failed: ' + err.message))
        } else {
          if (trace) { console.log('RECV: ' + data.toString('hex')) }
          return resolve(data)
        }
      })
    })
  }
}

// Finds a card with a ATR as in the list, then
// runs the application-promise generator
function run (atrs, app) {
  console.log('Please connect a card reaer and insert a card')
  // If a single ATR
  if (typeof atrs === 'string') {
    atrs = [atrs]
  }

  // When new reader is seen. SCardListReaders is done by node-pcsclite
  pcsc.on('reader', function (reader) {
    function pstate (status) {
      const states = [
        'SCARD_STATE_IGNORE',
        'SCARD_STATE_CHANGED',
        'SCARD_STATE_UNKNOWN',
        'SCARD_STATE_UNAVAILABLE',
        'SCARD_STATE_EMPTY',
        'SCARD_STATE_PRESENT',
        'SCARD_STATE_ATRMATCH',
        'SCARD_STATE_EXCLUSIVE',
        'SCARD_STATE_INUSE',
        'SCARD_STATE_MUTE',
        'SCARD_STATE_UNPOWERED'
      ]
      var res = []
      for (var s in states) {
        if (status & reader[states[s]]) {
          res.push(states[s])
        }
      }
      return res.join(', ')
    }

    // Handle errors
    reader.on('error', function (err) {
      console.log('Error(', this.name, '):', err.message)
    })

    var change = 0
    console.log('READER ', reader.name)

    // Query status of reader
    reader.on('status', function (status) {
      change = change ^ status.state
      if (trace) { console.log(pstate(status.state)) }

      // If card is present
      if ((change & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_CHANGED)) {
        console.log('CARD ' + reader.name)
        for (var atr in atrs) {
          if (Buffer.from(atrs[atr], 'hex').equals(status.atr)) {
            console.log('Card in %s matches (%s)!', reader.name, status.atr.toString('hex'))
          // Connect to card.
            reader.connect({
              share_mode: this.SCARD_SHARE_EXCLUSIVE
              // protocol: this.SCARD_PROTOCOL_T1
            }, function (err, protocol) {
              if (err) {
                console.log(err)
              } else {
                console.log('Starting application, protocol', protocol)
                reader.connected = true
                app(transmit(reader, protocol)).then(() => {
                  console.log('DONE')
                  reader.disconnect(() => {
                    console.log('Reader disconnected')
                    process.exit(0)
                  })
                }).catch((err) => {
                  console.log('Application failed', err)
                  process.exit(1)
                })
              }
            })
          }
        }
      } else if (status.state & this.SCARD_STATE_EMPTY && status.state & this.SCARD_STATE_CHANGED) {
        console.log('EMPTY ' + reader.name)
        if (reader.connected) {
          reader.disconnect(function (err) {
            if (err) {
              console.log('could not disconnect', err)
            }
          })
        }
      }
    })
  })

  pcsc.on('error', function (err) {
    console.log('PCSC error', err.message)
  })
}

module.exports.run = run
