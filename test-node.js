#!/usr/bin/env node
"use strict";
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
`;

var cli = require("./cli.js");
var esteid = require("./esteid.js");
const { Certificate } = require("@fidm/x509");

cli.centrify(banner);
cli.centrify(
  "EstEID for JS, version " + esteid.VERSION + " by github.com/@martinpljak"
);
cli.centrify("\n\n\n");

if (
  process.argv.length < 3 ||
  ["pcsc", "app"].indexOf(process.argv[2]) === -1
) {
  console.warn("Usage:\n\n$ npm test [pcsc|app]\n");
  process.exit(1);
}

var apdu = require("./apdu.js");
var jwt = require("./jwt.js");
var uuid = require("uuid");

const crypto = require("crypto");
const sha256 = crypto.createHash("sha256");

const sha256header = Buffer.from([
  0x30,
  0x31,
  0x30,
  0x0d,
  0x06,
  0x09,
  0x60,
  0x86,
  0x48,
  0x01,
  0x65,
  0x03,
  0x04,
  0x02,
  0x01,
  0x05,
  0x00,
  0x04,
  0x20
]);
const secret = "bottom secret / TOP SECRET";
const claim = "Hello, World!";
const hash = sha256.update(claim).digest();

function pem(b) {
  return (
    "-----BEGIN CERTIFICATE-----\n" +
    b.toString("base64") +
    "\n-----END CERTIFICATE-----"
  );
}

// transmit is a function that returns a promise to card connection
// app is a function that returns a promise
function testapp(transmit) {
  // Promise to run an application against a card.
  var EstEID = esteid.connect(apdu.apdufy(transmit));
  var t = {};
  var authcert;
  var signcert;
  return EstEID.getPersonalData()
    .then(function(data) {
      console.log("Personal data: " + JSON.stringify(data, null, 2));
      return EstEID.getPINCounters();
    })
    .then(function(pins) {
      console.log("PIN retry counters:");
      console.log("PIN1=%d PIN2=%d PUK=%d", pins[0], pins[1], pins[2]);
      return cli.confirm("Do PIN verification tests", false);
    })
    .then(function(yes) {
      if (yes) {
        return EstEID.verify(EstEID.PIN1, cli.PIN("Verify PIN1"))
          .then(function(r) {
            return EstEID.verify(EstEID.PIN2, cli.PIN("Verify PIN2"));
          })
          .then(function(r) {
            return EstEID.verify(EstEID.PUK, cli.PIN("Verify PUK"));
          })
          .then(function(r) {
            return EstEID.getCertificate(EstEID.SIGN);
          });
      } else {
        return EstEID.getCertificate(EstEID.SIGN);
      }
    })
    .then(function(r) {
      signcert = r;
      let c = Certificate.fromPEM(pem(r));
      // should be iso8859-15
      let cn = c.subject.attributes.find(e => e.oid === '2.5.4.3').value.toString('latin1');
      let ou = c.subject.attributes.find(e => e.oid === '2.5.4.11').value.toString('latin1');
      console.log("Certificate:", cn, ou);
      return EstEID.getCertificate(EstEID.AUTH);
    })
    .then(function(r) {
      authcert = r;
      let c = Certificate.fromPEM(pem(r));
      // should be iso8859-15
      let cn = c.subject.attributes.find(e => e.oid === '2.5.4.3').value.toString('latin1');
      let ou = c.subject.attributes.find(e => e.oid === '2.5.4.11').value.toString('latin1');
      console.log("Certificate:", cn, ou);
      // Do sample JWT based on authentication certificate
      t = jwt.jwt(authcert, uuid(), "https://example.com");
      return Promise.resolve(t);
    })
    .then(function(result) {
      // Sign the JWT
      var payload = Buffer.concat([sha256header, t.hash()]);
      return EstEID.authenticate(payload, cli.PIN("PIN1"));
    })
    .then(function(signature) {
      console.log("JWT: ", t.sign(signature));
      console.log('Encrypting "%s"', secret);
      var encrypted = crypto.publicEncrypt(
        { key: t.cert(), padding: crypto.constants.RSA_PKCS1_PADDING },
        Buffer.from(secret)
      );
      return EstEID.decrypt(encrypted);
    })
    .then(function(plaintext) {
      console.log('Decrypted to "%s"', plaintext.toString());
      console.log(
        'Signing "%s" (sha256:%s)',
        claim,
        hash.toString("hex").toUpperCase()
      );
      var payload = Buffer.concat([sha256header, hash]);
      return EstEID.sign(payload, cli.PIN("PIN2"));
    })
    .then(function(signature) {
      var v = crypto.createVerify("RSA-SHA256");
      v.update(claim);
      console.log("Signature verifies:", v.verify(pem(signcert), signature));
      var pt = crypto.publicDecrypt(pem(signcert), signature);
      console.log(
        "Raw data:",
        pt
          .slice(0, sha256header.length)
          .toString("hex")
          .toUpperCase(),
        pt
          .slice(sha256header.length, pt.length)
          .toString("hex")
          .toUpperCase()
      );
    })
    .catch(function(reason) {
      console.log("Some of the tests failed", reason);
      throw reason;
    });
}

if (process.argv[2] === "pcsc") {
  const pcsc = require("./node-pcsc.js");
  pcsc.run(testapp, esteid.ATRS);
} else if (process.argv[2] === "app") {
  const ws = require("./node-web-eid-ws.js");
  ws.run(testapp, esteid.ATRS).catch(function(reason) {
    console.log("Application failed: ", reason);
  });
}
