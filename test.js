'use strict'
// We are fancy, indeed
const banner = `
   ▄████████    ▄████████     ███        ▄████████  ▄█  ████████▄
  ███    ███   ███    ███ ▀█████████▄   ███    ███ ███  ███   ▀███
  ███    █▀    ███    █▀     ▀███▀▀██   ███    █▀  ███▌ ███    ███
 ▄███▄▄▄       ███            ███   ▀  ▄███▄▄▄     ███▌ ███    ███
▀▀███▀▀▀     ▀███████████     ███     ▀▀███▀▀▀     ███▌ ███    ███
  ███    █▄           ███     ███       ███    █▄  ███  ███    ███
  ███    ███    ▄█    ███     ███       ███    ███ ███  ███   ▄███
  ██████████  ▄████████▀     ▄████▀     ██████████ █▀   ████████▀
`

var cli = require('./cli.js')
var esteid = require('./esteid.js')

cli.centrify(banner)
cli.centrify('EstEID for JS, version ' + esteid.VERSION + ' by github.com/@martinpljak')
cli.centrify('\n\n\n')
var card = require('./card.js')

var apdu = require('./apdu.js')
var jwt = require('./jwt.js')
var x509 = require('x509')
var uuid = require('uuid')

const crypto = require('crypto')
const sha256 = crypto.createHash('sha256')

const sha256header = Buffer.from([0x30, 0x31, 0x30, 0x0d, 0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01, 0x05, 0x00, 0x04, 0x20])
const secret = 'bottom secret / TOP SECRET'
const claim = 'Hello, World!'
const hash = sha256.update(claim).digest()

function pem (b) {
  return '-----BEGIN CERTIFICATE-----\n' + b.toString('base64') + '\n-----END CERTIFICATE-----'
}

// connector is a function that returns a promise to card connection
function testme (transmit) {
  // Promise to run an application against a card.
  return new Promise(function (resolve, reject) {
    var EstEID = esteid.connect(apdu.apdufy(transmit))
    var t = {}

    EstEID.getPersonalData().then(function (data) {
      console.log('Personal data: ' + JSON.stringify(data, null, 2))
      return EstEID.getPINCounters()
    }).then(function (pins) {
      console.log('PIN retry counters:')
      console.log('PIN1=%d PIN2=%d PUK=%d', pins[0], pins[1], pins[2])
      return EstEID.readCert(1)
    }).then(function (r) {
      var c = x509.parseCert(pem(r))
      console.log('Authentication certificate:', c.subject.commonName)
      // Do sample JWT based on authentication certificate
      t = jwt.jwt(r, uuid(), 'https://example.com')
      return Promise.resolve(t)
    }).then(function (result) {
      // Sign the JWT
      var payload = Buffer.concat([sha256header, t.hash()])
      return EstEID.authenticate(payload, cli.PIN('Enter PIN1'))
    }).then(function (signature) {
      console.log('JWT is', t.sign(signature))
      console.log('Encrypting "%s"', secret)
      var encrypted = crypto.publicEncrypt({key: t.cert(), padding: crypto.constants.RSA_PKCS1_PADDING}, Buffer.from(secret))
      return EstEID.decrypt(encrypted)
    }).then(function (plaintext) {
      console.log('Decrypted to "%s"', plaintext.toString())
      console.log('Signing "%s" (sha256:%s)', claim, hash.toString('hex').toUpperCase())
      var payload = Buffer.concat([sha256header, hash])
      return EstEID.sign(payload, cli.PIN('Enter PIN2'))
    }).then(function (signature) {
      // TODO: verify signature
      resolve()
    }).catch(function (reason) {
      console.log('Some of the tests failed', reason)
      reject(reason)
    })
  })
}

card.run(esteid.ATRS, testme)
