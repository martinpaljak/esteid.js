"use strict";

const jwt = require("jsonwebtoken");

var cert = token => {
  const parsed = jwt.decode(token, { complete: true });
  if (parsed && parsed.header.x5c) {
    return (
      "-----BEGIN CERTIFICATE-----\n" +
      parsed.header.x5c[0] +
      "\n-----END CERTIFICATE-----"
    );
  } else {
    return "";
  }
};

if (process.argv.length < 3) {
  process.exit(1);
}

var token = process.argv[2];

try {
  var result = jwt.verify(token, cert(token), { ignoreExpiration: true });
  console.log("Verified: %s on %s", result.sub, result.aud);
} catch (e) {
  console.log("Verification failed:", e.message);
}
