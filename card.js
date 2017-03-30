'use strict';

var pcsc = require('pcsclite')();

function pcsc_transmit(reader, protocol) {
  return function (apdu) {
    // Assume buffers at this point of time
    if (typeof apdu === 'string') {
      apdu = new Buffer(apdu, 'hex');
    }
    var get_response = protocol === 1;
    return new Promise(function (resolve, reject) {
      console.log("SEND: " + apdu.toString('hex'));
      reader.transmit(apdu, 4096, protocol, function (err, data) {
        if (err) {
          reject(err);
        } else {
          // TODO: GET RESPONSE (61XX) and Le (6CXX) handling
          var sw = data.slice(-2);
          console.log("RECV: " + data.slice(0, data.length - 2).toString('hex') + " SW: " + sw.toString('hex'));
          resolve(data);
        }
      });
    });
  };
}

// Finds a card with a ATR as in the list, then calls
// callback(transmit)
// where transmit returns a promise
// TODO: add disconnect argument
function card_with_atr(atrs, callback) {
  if (typeof atrs === 'string') {
    atrs = [atrs];
  }
  // When new reader is seen. SCardListReaders is done by node-pcsclite
  pcsc.on('reader', function (reader) {
  // Handle errors
    reader.on('error', function (err) {
      console.log('Error(', this.name, '):', err.message);
    });

  // Query status of reader
    reader.on('status', function (status) {
    // If card is present
      if ((status.state & this.SCARD_STATE_PRESENT)) {
        for (var atr in atrs) {
          if (new Buffer(atrs[atr], 'hex').equals(status.atr)) {
            console.log("Card in reader %s is EstEID (%s)!", reader.name, status.atr.toString('hex'));
          // Connect to card.
            reader.connect({
              share_mode: this.SCARD_SHARE_SHARED,
            }, function (err, protocol) {
              if (err) {
                console.log(err);
              } else {
                callback(pcsc_transmit(reader, protocol));
              }
            });
          }
        }
      } else {
        console.log(reader.name, "is empty, not interesting");
        reader.disconnect(function () {});
      }
    });
  });

  pcsc.on('error', function (err) {
    console.log('PCSC error', err.message);
  });
}

module.exports.card_with_atr = card_with_atr;
