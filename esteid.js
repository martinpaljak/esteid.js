(function () {
  'use strict'

  const apdu = require('./apdu.js')
  const pkg = require('./package.json')

  const VERSION = pkg.version
  const ATRS = [
    '3BFE9400FF80B1FA451F034573744549442076657220312E3043',
    '3BDE18FFC080B1FE451F034573744549442076657220312E302B',
    '3B5E11FF4573744549442076657220312E30',
    '3B6E00004573744549442076657220312E30',
    '3BFE1800008031FE454573744549442076657220312E30A8',
    '3BFE1800008031FE45803180664090A4561B168301900086',
    '3BFE1800008031FE45803180664090A4162A0083019000E1',
    '3BFE1800008031FE45803180664090A4162A00830F9000EF',
    '3BF9180000C00A31FE4553462D3443432D303181',
    '3BF81300008131FE454A434F5076323431B7',
    '3BFA1800008031FE45FE654944202F20504B4903'
  ]

  const PIN1 = 1
  const PIN2 = 2
  const PUK = 0

  const AUTH = 1
  const SIGN = 2

  // construct
  var esteid = function () {
    console.log('EstEID v' + VERSION)
    // Fields to be exported
    var fields = {}

    // transmit takes an APDU and returns a promise that resolves to the response bytes
    fields.connect = function (transmit) {
      var eid = {}

      function getPINCounters (pin) {
        if (typeof pin === 'undefined') { pin = [0, 1, 2] } else if (typeof pin === 'number') { pin = [pin] }
        var counters = []
        return new Promise(function (resolve, reject) {
          // SELECT FILE MF
          apdu.check(transmit('00a4000c')).then(function () {
            // SELECT FILE 0016
            return apdu.check(transmit('00a4020c020016'))
          }).then(function (response) {
            // NB! requires sequential execution
            pin.reduce(function (promise, item) {
              return promise.then(function (result) {
                // READ RECORD
                return apdu.check(transmit(Buffer.from([0x00, 0xB2, item + 1, 0x04, 0x00]))).then(function (result) {
                  counters[item] = result[5]
                }).catch(function (err) {
                  console.log('Reading counters failed', err)
                  return reject(err)
                })
              })
            }, Promise.resolve()).then(function () {
              if (counters.length === 1) { resolve(counters[0]) } else { resolve(counters) }
            }, function (err) {
              console.log('records failed')
              reject(err)
            })
          }).catch(function (err) {
            return reject(err)
          })
        })
      }

      function getPersonalData (select) {
        var records = [
          'SURNAME',
          'GIVEN_NAMES1',
          'GIVEN_NAMES2',
          'SEX',
          'CITIZENSHIP',
          'DATE_OF_BIRTH',
          'PERSONAL_ID',
          'DOCUMENT_NR',
          'EXPIRY_DATE',
          'PLACE_OF_BIRTH',
          'ISSUING_DATE',
          'PERMIT_TYPE',
          'REMARK1',
          'REMARK2',
          'REMARK3',
          'REMARK4'
        ]
        if (typeof select === 'undefined') { select = records } else if (typeof select === 'string') { select = [select] }
        return new Promise(function (resolve, reject) {
            // SELECT FILE MF
          apdu.check(transmit('00a4000c')).then(function (response) {
            // SELECT FILE EEEE
            return apdu.check(transmit('00a4010c02eeee'))
          }).then(function (response) {
            // SELECT FILE 5044
            return apdu.check(transmit('00a4020c025044'))
          }).then(function (response) {
            // NB! requires sequential exection
            var personaldata = {}
            select.reduce(function (promise, item) {
              return promise.then(function (result) {
                // READ RECORD
                return apdu.check(transmit(Buffer.from([0x00, 0xB2, records.indexOf(item) + 1, 0x04, 0x00]))).then(function (result) {
                  var recordvalue = result.slice(0, result.length - 2)
                  // FIXME: latin1 is not correct, must be Windows-1257
                  personaldata[item] = recordvalue.length === 1 && recordvalue[0] === 0x00 ? '' : recordvalue.toString('latin1').trim()
                }).catch(function (err) {
                  console.log('Reading persodata failed', err)
                  return reject(err)
                })
              })
            }, Promise.resolve()).then(function () {
              // Final reduced promise resolves the data
              resolve(personaldata)
            })
          }).catch(function (err) {
            return reject(err)
          })
        })
      }

      function verify (pin, value) {
        // Verify mentioned PIN
        return new Promise(function (resolve, reject) {
          value.then(function (pv) {
            var cmd = Buffer.from([0x00, 0x20, 0x00, 0x00, 0x00])
            cmd[3] = pin
            var pinvalue = Buffer.from(pv, 'ascii')
            cmd[4] = pinvalue.length
            return transmit(Buffer.concat([cmd, pinvalue])).then(function (response) {
              var sw = apdu.sw(response)
              if (sw === 0x9000) {
                return resolve(true)
              } else if ((sw & 0x6300) === 0x6300) {
                // Correct is 63CX but some cards are known to miss this
                return reject(new Error('Incorrect PIN, tries left: ' + (sw & 0xf).toString(16)))
              } else {
                return reject(new Error('PIN verification failed: ' + sw.toString(16)))
              }
            }).catch(function (reason) {
              console.log('PIN verification failed: ', reason)
              return reject(reason)
            })
          })
        })
      }

      function getCertificate (type) {
        return new Promise(function (resolve, reject) {
            // SELECT FILE MF
          apdu.check(transmit('00a4000c')).then(function () {
            // SELECT FILE EEEE
            return apdu.check(transmit('00a4010c02eeee'))
          }).then(function () {
            // read aace or ddce
            return apdu.check(transmit('00a4020c02' + (type === AUTH ? 'aace' : 'ddce')))
          }).then(function () {
            // NB! requires sequential execution
            var cert = Buffer.from([])
            var step = 256
            function readfrom (offset, total) {
              var cmd = Buffer.from([0x00, 0xB0, offset >> 8 & 0xFF, offset & 0xFF, step])
              return apdu.check(transmit(cmd), 0x6282).then(function (response) {
                var chunk = response.slice(0, response.length - 2)
                cert = Buffer.concat([cert, chunk])
                // 3.4 happily returns zero length chunks if read from end of file
                // This also handles 6a82
                if (chunk.length === 0 || cert.length >= total) {
                  // find the last byte with non-null value
                  var cut = cert.length - 1
                  for (;cert[cut] === 0x00; cut--) {}
                  return resolve(cert.slice(0, cut + 1))
                } else { return readfrom(offset + chunk.length, total) }
              }, function (reason) {
                console.log('READ BINARY failed', reason)
                return reject(reason)
              })
            }
            // Read from 0, total of 0x6000
            return readfrom(0, 0x800)
          }).catch(function (err) {
            return reject(err)
          })
        })
      }

      function authenticate (dtbs, pin) {
        return new Promise(function (resolve, reject) {
          var header = Buffer.from([0x00, 0x88, 0x00, 0x00, 0x00])
          header[4] = dtbs.length // payload length
           // Add Le
          var cmd = Buffer.concat([header, dtbs, Buffer.from([0x00])])
          apdu.check(transmit(cmd), 0x6982).then(function (response) {
            if (apdu.sw(response) === 0x6982) {
              return eid.verify(eid.PIN1, pin).then(function () {
                apdu.check(transmit(cmd)).then(function (response) {
                  resolve(apdu.data(response))
                })
              })
            } else { return resolve(apdu.data(response)) }
          }).catch(function (reason) {
            console.log('Authentication failed: ', reason)
            return reject(reason)
          })
        })
      }

      function sign (dtbs, pin) {
        return new Promise(function (resolve, reject) {
          // SET SECURITY ENVIRONMENT
          apdu.check(transmit('0022F301')).then(function () {
            // VERIFY PIN2
            return eid.verify(eid.PIN2, pin)
          }).then(function () {
            // PSO DIGITAL SIGNATurE
            var header = Buffer.from([0x00, 0x2a, 0x9e, 0x9a, 0x00])
            header[4] = dtbs.length // payload length
             // Add Le
            var cmd = Buffer.concat([header, dtbs, Buffer.from([0x00])])
            return apdu.check(transmit(cmd))
          }).then(function (response) {
            // resolve to signature
            return resolve(apdu.data(response))
          }).catch(function (reason) {
            console.log('Signing failed: ', reason)
            return reject(reason)
          })
        })
      }

      function decrypt (cgram, pin) {
        return new Promise(function (resolve, reject) {
          // prepend 0x00
          cgram = Buffer.concat([Buffer.from([0x00]), cgram])
          const sp = Math.ceil(cgram.length / 2)
          var chunks = [cgram.slice(0, sp), cgram.slice(sp, cgram.length)]
          var header = Buffer.from([0x00, 0x2a, 0x80, 0x86, 0x00])
          function decr () {
            var chunk = chunks.shift()
            header[0] = chunks.length === 0 ? 0x00 : 0x10
            header[4] = chunk.length
            var cmd = Buffer.concat([header, chunk, Buffer.from([0x00])])
            apdu.check(transmit(cmd)).then(function (r) {
              if (chunks.length === 0) { return resolve(apdu.data(r)) } else { return decr() }
            }).catch(function (reason) {
              console.log('Decryption failed')
              reject(reason)
            })
          }
          apdu.check(transmit('0022F306')).then(function () {
            return apdu.check(transmit('002241b8058303801100'))
          }).then(function () {
            return decr()
          })
        })
      }

      // Members
      eid.verify = verify
      eid.sign = sign
      eid.authenticate = authenticate
      eid.decrypt = decrypt
      eid.getPersonalData = getPersonalData
      eid.getCertificate = getCertificate
      eid.getPINCounters = getPINCounters

      eid.AUTH = AUTH
      eid.SIGN = SIGN
      eid.PIN1 = PIN1
      eid.PIN2 = PIN2
      eid.PUK = PUK

      return eid
    }

    fields.VERSION = VERSION
    fields.ATRS = ATRS
    return fields
  }

  // Register
  if (typeof (exports) !== 'undefined') {
    // nodejs
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = esteid()
    } else {
      exports.esteid = esteid()
    }
  }
})()
