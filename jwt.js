// construct a jwt based on certificate
const x509 = require('x509') // for parsing the certificate
const crypto = require('crypto')
const sha256 = crypto.createHash('sha256')

var base64urlencode = function encode (b) {
  return Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

var base64urldecode = function (t) {
  return Buffer.from((t + '==='.slice((t.length + 3) % 4)).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
}

// XXX: x509 requires PEM headers
function pem (b) {
  return '-----BEGIN CERTIFICATE-----\n' + b.toString('base64') + '\n-----END CERTIFICATE-----'
}

function token (c, nonce, origin) {
  var r = {}

  r.header = JSON.stringify({'alg': 'RS256', 'typ': 'JWT', 'x5c': [c.toString('base64')]})
  // TODO: get rid of this dependency
  const crt = x509.parseCert(pem(c))
  const now = new Date().getTime()
  r.payload = JSON.stringify({
    aud: origin,
    iat: now,
    exp: now + 5 * 60,
    iss: crt.issuer.commonName,
    nonce: nonce,
    sub: crt.subject.commonName
  })
  r.crt = pem(c)

  r.sign = function (sig) {
    return this.dtbs() + '.' + base64urlencode(sig)
  }

  r.dtbs = function () {
    return Buffer.from(base64urlencode(this.header) + '.' + base64urlencode(this.payload))
  }

  r.hash = function () {
    return sha256.update(this.dtbs()).digest()
  }

  r.cert = function () {
    return this.crt
  }

  return r
}

module.exports.jwt = token
module.exports.b64e = base64urlencode
module.exports.b64d = base64urldecode
