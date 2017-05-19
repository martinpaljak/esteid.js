# esteid.js &middot; [![npm version](https://badge.fury.io/js/esteid.svg)](https://badge.fury.io/js/esteid)
Provides a high level API that transaltes to low level APDU interface of EstEID cards, in JavaScript.

For NodeJS and browsers.

## BIBO transmit explained
Requires the availability of a reliable Promise based BIBO (Bytes-go-In, Bytes-come-Out) transmit function. That is, a function that takes an APDU and returns a Promise that would resolve to the response from the card, that with a mix of PC/SC and JavaScript would look something like:

```javascript
function transmit(Buffer apdu) {
   return new Promise((resolve, reject) => resolve(SCardTransmit(apdu)))
}
```
Three implementations are provided:

 - Node [PC/SC interface](https://msdn.microsoft.com/en-us/library/windows/desktop/aa379804(v=vs.85).aspx), provided by [node-pcsclite](https://github.com/santigimeno/node-pcsclite) (in [`node-pcsc.js`](./node-pcsc.js))
 - Node RPC interface via [Web eID app WebSocket protocol](https://github.com/web-eid/web-eid/wiki/MessagingAPI) (in [`node-web-eid-ws.js`](./node-web-eid-ws.js))
 - Browser app interface via [web-eid.js](https://github.com/web-eid/web-eid.js) (TBD, in [`web.js`](./web.js) and [`web.html`](./web.html))

## Development
You need a [recent NodeJS](https://nodejs.org/en/download/current/) and developer tools for native code compilation. On Windows also [OpenSSL 1.0.X](https://slproweb.com/products/Win32OpenSSL.html) that matches the architecture of NodeJS.

```shell
git clone https://github.com/martinpaljak/esteid.js
cd esteid.js
npm install
npm test
```
Give the target you want to test as parameter to `npm test`

## API and usage
First
```shell
npm install --save-dev esteid
```
then

```javascript
const esteid = require('esteid')
```

### `esteid.connect(transmit)`
Creates an instance of EstEID, bound to the transmit channel. Takes the BIBO-Promise-function as the parameter.

```javascript
var EstEID = esteid.connect(transmit)
```

### `EstEID.getPersonalData(fields)`
Returns a Promise that resolves to the personal data file contents. Takes a field name (string) or a list of field names as a parameter. By default reads all fields.

```javascript
EstEID.getPersonalData().then(
  (data) => console.log(JSON.stringify(data, null, 2))
)
```
Would show
```javascript
{
  "SURNAME": "PALJAK",
  "GIVEN_NAMES1": "MARTIN",
  "GIVEN_NAMES2": "",
  "SEX": "M",
  "CITIZENSHIP": "EST",
  "DATE_OF_BIRTH": "16.07.1982",
  "PERSONAL_ID": "38207162722",
  "DOCUMENT_NR": "AA044XXXX",
  "EXPIRY_DATE": "23.11.2017",
  "PLACE_OF_BIRTH": "EESTI / EST",
  "ISSUING_DATE": "08.05.2013",
  "PERMIT_TYPE": "",
  "REMARK1": "",
  "REMARK2": "",
  "REMARK3": "",
  "REMARK4": ""
}
```

### `EstEID.verify(pin, valuepromise)`
Returns a Promise that resolves if PIN verification succeeds. Use `EstEID.PIN1`, `EstEID.PIN2` and `EstEID.PUK` to indicate PIN type. `valuepromise` must resolve to the PIN value, as an ASCII string.

```javascript
var pin = Promise.resolve('1234')
EstEID.verify(EstEID.PIN1, pin).then(
  () => console.log('PIN verified'),
  (e) => console.log('PIN verification failed', e)
)
```

There is a handy PIN wrapper for CLI application in `cli.js`

```javascript
const cli = require('./cli.js')
EstEID.verify(EstEID.PIN1, cli.PIN('Please enter PIN1')).then(
  () => console.log('PIN verified'),
  (e) => console.log('PIN verification failed', e)
)
```

### `EstEID.getCertificate(type)`
Returns a Promise that resolves to the certificate as a Buffer. Use `EstEID.AUTH` and `EstEID.SIGN` to indicate certificate type.

```javascript
EstEID.getCertificate(EstEID.AUTH).then((cert) => {
   // do something with the certificate
})
```

### `EstEID.authenticate(challenge, pinpromise)`
Returns a Promise that resolves to the result of RSA signature operation with the authentication key, as a Buffer.
PIN promise, if provided, is resolved only if the card is in unauthenticated state.

```javascript
EstEID.authenticate(challenge).then((cryptogram) => {
   // do something with the cryptogram
})
```

### `EstEID.sign(dtbs, pinpromise)`
Returns a Promise that resolves to the result of RSA signature operation with the signing key, as a Buffer.
PIN promise is required and is always resolved.

```javascript
EstEID.sign(dtbs, Promise.resolve('12345')).then((signature) => {
   // do something with the signature
})
```

### `EstEID.decrypt(cryptogram, pinpromise)`
Returns a Promise that resolves to the result of RSA decryption operation with the authentication key, as a Buffer.
PIN promise, if provided, is resolved only if the card is in unauthenticated state.

```javascript
EstEID.decrypt(cryptogram).then((plaintext) => {
   // do something with the plaintext
})
```

### `EstEID.getPINCounters(pin)`
Returns a Promise that resolves to the remaining PIN tries for all PIN-s or the PIN specified. By default all remaining retries are returned in an array (`[PIN1, PIN2, PUK]`). If a single pin is given as a parameter, a single counter is returned.

```javascript
EstEID.getPINCounters().then((triesleft) => {
   // do something with the tries left information
})
```

### `EstEID.getKeyCounters(key)`
Returns a Promise that resolves to the key usage counters. By default both counters returned in an array (`[AUTH, SIGN]`). If a single key is given as a parameter, a single counter is returned.

```javascript
EstEID.getKeyCounters().then((counters) => {
   // do something with the counters
})
```
