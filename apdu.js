'use strict'
var trace = false

function formatResponse (apdu) {
  return apdu.slice(0, apdu.length - 2).toString('hex') + (apdu.length === 2 ? '' : ' ') + apdu.slice(-2).toString('hex')
}

function formatCommand (apdu) {
  if (apdu.length === 4) {
    return apdu.toString('hex')
  } else if (apdu.length >= 5) {
    return apdu.slice(0, 4).toString('hex') + ' ' + apdu.slice(4, 5).toString('hex') + ' ' + apdu.slice(5, 5 + apdu[4]).toString('hex')
  }
}

// given a function that returns promises for APDU-s as raw bytes
// wrap it with APDU semantics for GET RESPONSE handling
function apdufy (transmit) {
  return function (apdu) {
    // Allow to transmit hex strings
    if (typeof apdu === 'string') {
      apdu = Buffer.from(apdu, 'hex')
    }
    return new Promise(function (resolve, reject) {
      var start = new Date().getTime()
      if (trace) { console.log('A>> ' + formatCommand(apdu)) }
      transmit(apdu).then(function (response) {
        var sw = response.slice(-2)
        if (sw[0] === 0x61) {
          transmit(Buffer.from([0x00, 0xC0, 0x00, 0x00, sw[1]])).then(function (response) {
            if (trace) {
              var ms = new Date().getTime() - start
              console.log('A<< (%d ms) %s', ms, formatResponse(response))
            }
            return resolve(response)
          }).catch(function (reason) {
            return reject(reason)
          })
        } else {
          var ms = new Date().getTime() - start
          if (trace) { console.log('A<< (%d ms) %s', ms, formatResponse(response)) }
          return resolve(response)
        }
      }).catch(function (reason) {
        return reject(reason)
      })
    })
  }
}

// Given a APDU promise, reject it if sw is not 0x9000
function check (p, ok) {
  var oksw = []
  if (typeof ok === 'number') { oksw.push(ok) }
  if (oksw.indexOf(0x9000) === -1) { oksw.push(0x9000) }
  return new Promise(function (resolve, reject) {
    p.then(function (response) {
      const sw = getsw(response)
      if (oksw.indexOf(sw) === -1) {
        return reject(new Error('APDU SW check failed, SW 0x' + sw.toString(16) + ' not in ' + oksw.map(function (x) { return '0x' + x.toString(16)}).join(' ')))
      } else {
        return resolve(response)
      }
    }).catch(function (reason) {
      console.log('APDU failed, thus not SW check')
      reject(reason)
    })
  })
}

function getsw (response) {
  var sw = response.slice(-2)
  return (sw[0] << 8) | sw[1]
}

function getdata (response) {
  return response.slice(0, response.length - 2)
}

module.exports.apdufy = apdufy
module.exports.check = check
module.exports.sw = getsw
module.exports.data = getdata
