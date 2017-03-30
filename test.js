'use strict';

var card = require('./card.js');
var esteid = require('./esteid.js');

card.card_with_atr(esteid.ATRS, function(transmit) {
  var EstEID = esteid.connect(transmit);

  EstEID.getPersonalData().then(function (response) {
      console.log("Personal data: " + JSON.stringify(response, null, 2));
   });
});



