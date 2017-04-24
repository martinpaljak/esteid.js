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

const PIN1 = function () {
  if (process.env.PIN1) {
    return Promise.resolve(process.env.PIN1)
  } else return cli.PIN('Please enter PIN1')
}

const PIN2 = function () {
  if (process.env.PIN2) {
    return Promise.resolve(process.env.PIN2)
  } else return cli.PIN('Please enter PIN2')
}

// connector is a function that returns a promise to card connection
function testme (transmit) {
  // Promise to run an application against a card.
  return new Promise(function (resolve, reject) {
    var EstEID = esteid.connect(apdu.apdufy(transmit))
    var t = {}
    var authcert
    var signcert
    EstEID.getPersonalData().then(function (data) {
      console.log('Personal data: ' + JSON.stringify(data, null, 2))
      return EstEID.getPINCounters()
    }).then(function (pins) {
      console.log('PIN retry counters:')
      console.log('PIN1=%d PIN2=%d PUK=%d', pins[0], pins[1], pins[2])
      return EstEID.getCertificate(EstEID.SIGN)
    }).then(function (r) {
      signcert = r
      var c = x509.parseCert(pem(r))
      console.log('Certificate:', c.subject.commonName, c.subject.organizationalUnitName)
      return EstEID.getCertificate(EstEID.AUTH)
    }).then(function (r) {
      authcert = r
      var c = x509.parseCert(pem(r))
      console.log('Certificate:', c.subject.commonName, c.subject.organizationalUnitName)
      // Do sample JWT based on authentication certificate
      t = jwt.jwt(authcert, uuid(), 'https://example.com')
      return Promise.resolve(t)
    }).then(function (result) {
      // Sign the JWT
      var payload = Buffer.concat([sha256header, t.hash()])
      return EstEID.authenticate(payload, PIN1())
    }).then(function (signature) {
      console.log('JWT: ', t.sign(signature))
      console.log('Encrypting "%s"', secret)
      var encrypted = crypto.publicEncrypt({key: t.cert(), padding: crypto.constants.RSA_PKCS1_PADDING}, Buffer.from(secret))
      return EstEID.decrypt(encrypted)
    }).then(function (plaintext) {
      console.log('Decrypted to "%s"', plaintext.toString())
      console.log('Signing "%s" (sha256:%s)', claim, hash.toString('hex').toUpperCase())
      var payload = Buffer.concat([sha256header, hash])
      return EstEID.sign(payload, PIN2())
    }).then(function (signature) {
      var v = crypto.createVerify('RSA-SHA256')
      v.update(claim)
      console.log('Signature verifies:', v.verify(pem(signcert), signature))
      var pt = crypto.publicDecrypt(pem(signcert), signature)
      console.log('Raw data:', pt.slice(0, sha256header.length).toString('hex').toUpperCase(), pt.slice(sha256header.length, pt.length).toString('hex').toUpperCase())
      resolve()
    }).catch(function (reason) {
      console.log('Some of the tests failed', reason)
      reject(reason)
    })
  })
}
// Run above app whenever a card with EstEID ATR is inserted
card.run(esteid.ATRS, testme)
