"use strict";
const trace = false;
const WebSocket = require("ws");
const APPURL = "wss://app.web-eid.com:42123";
const ORIGIN = "https://example.com";

function getNonce(l) {
  if (l === undefined) {
    l = 24;
  }
  var val = "";
  var hex = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVXYZ";
  for (var i = 0; i < l; i++) {
    val += hex.charAt(Math.floor(Math.random() * hex.length));
  }
  return val;
}

// Return a promise that resolves to an object
// that has a .send() method that returns a promise
// that resolves to the reply from app
function WSConnect(url, options) {
  return new Promise(function(resolve, reject) {
    var ws = {};
    ws.socket = new WebSocket(APPURL, { origin: ORIGIN });
    ws.promises = {};
    ws.socket.onerror = function(event) {
      reject(event);
    };
    ws.socket.onopen = function() {
      ws.socket.onmessage = function(message) {
        var msg = JSON.parse(message.data);
        if (trace) {
          console.log("RECV", JSON.stringify(msg));
        }
        if (msg.id in ws.promises) {
          if (!msg.error) {
            ws.promises[msg.id].resolve(msg);
          } else {
            ws.promises[msg.id].reject(
              new Error("Web eID status: " + msg.error)
            );
          }
          delete ws.promises[msg.id];
        }
      };
      ws.send = function(msg) {
        return new Promise(function(resolve, reject) {
          var id = getNonce();
          msg.id = id;
          if (trace) {
            console.log("SEND", JSON.stringify(msg));
          }
          ws.socket.send(JSON.stringify(msg));
          ws.promises[id] = { resolve: resolve, reject: reject };
        });
      };
      ws.disconnect = function() {
        ws.socket.close();
      };
      resolve(ws);
    };
  });
}

// app is a function that takes as an argument a function
// which takes an APDU an returns a promise that resolves to the APDU response
function runapp(app, atrs) {
  // convert ATR-s
  var baseatrs = [];
  // FIXME: fix this in test-node.js
  for (var atr in atrs) {
    baseatrs.push(Buffer.from(atrs[atr], "hex").toString("base64"));
  }
  return WSConnect(APPURL, {}).then(function(ws) {
    var readername;
    return ws
      .send({ SCardConnect: { protocol: "*", atrs: baseatrs } })
      .then(function(reader) {
        var atrbin = Buffer.from(reader.atr, "base64");
        if (baseatrs.indexOf(atrbin) === -1) {
          console.log("This is not the card we wanted");
        }
        readername = reader.reader;
        // Reader is currently a dummy.
        function transmit(apdu) {
          return ws
            .send({
              SCardTransmit: {
                reader: readername,
                bytes: apdu.toString("base64")
              }
            })
            .then(function(response) {
              return Buffer.from(response.bytes, "base64");
            });
        }
        return app(transmit);
      })
      .then(function(blah) {
        return ws
          .send({ SCardDisconnect: { reader: readername } })
          .then(function() {
            readername = undefined;
            ws.disconnect();
          });
      })
      .catch(function(reason) {
        if (readername) {
          ws.send({ SCardDisconnect: { reader: readername } }).then(function() {
            ws.disconnect();
          });
        }
        throw reason;
      });
  });
}

module.exports.run = runapp;
