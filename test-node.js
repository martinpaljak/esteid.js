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
async function testapp(transmit) {
  // Promise to run an application against a card.
  let EstEID = esteid.connect(apdu.apdufy(transmit));
  var t = {};
  var authcert;
  var signcert;
  let pd = await EstEID.getPersonalData();
  console.log("Personal data: " + JSON.stringify(pd, null, 2));
  let pins = await EstEID.getPINCounters();
  console.log("PIN retry counters:");
  console.log("PIN1=%d PIN2=%d PUK=%d", pins[0], pins[1], pins[2]);

  let a = await EstEID.getCertificate(EstEID.AUTH);
  let s = await EstEID.getCertificate(EstEID.SIGN);
  let c = Certificate.fromPEM(pem(a));
  // should be iso8859-15
  let cn = c.subject.attributes
    .find(e => e.oid === "2.5.4.3")
    .value.toString("latin1");
  let ou = c.subject.attributes
    .find(e => e.oid === "2.5.4.11")
    .value.toString("latin1");
  console.log("AUTH:", cn, ou);

  if (await cli.confirm("Do PIN verification tests", false)) {
    await EstEID.verify(EstEID.PIN1, cli.PIN("Verify PIN1"));
    await EstEID.verify(EstEID.PIN2, cli.PIN("Verify PIN2"));
    await EstEID.verify(EstEID.PUK, cli.PIN("Verify PUK"));
  }
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
