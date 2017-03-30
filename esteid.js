(function () {
  'use strict';

  var VERSION = "0.0.2";
  var ATRS = [
    "3BFE9400FF80B1FA451F034573744549442076657220312E3043",
    "3BDE18FFC080B1FE451F034573744549442076657220312E302B",
    "3B5E11FF4573744549442076657220312E30",
    "3B6E00004573744549442076657220312E30",
    "3BFE1800008031FE454573744549442076657220312E30A8",
    "3BFE1800008031FE45803180664090A4561B168301900086",
    "3BFE1800008031FE45803180664090A4162A0083019000E1",
    "3BFE1800008031FE45803180664090A4162A00830F9000EF",
    "3BF9180000C00A31FE4553462D3443432D303181",
    "3BF81300008131FE454A434F5076323431B7",
    "3BFA1800008031FE45FE654944202F20504B4903",
  ];

  // construct
  var esteid = function () {
    console.log("EstEID v" + VERSION);
    // Fields to be exported
    var fields = {};

    // transmit takes an APDU and returns a promise that resolves to response
    fields.connect = function (transmit) {
      var eid = {};
      eid.getPersonalData = function () {
        console.log("Reading personal data");
        var records = [
          'SURNAME',
          'GIVEN_NAMES1',
          'GIVEN_NAMES2',
          'SEX',
          'CITIZENSHIP',
          'DATE_OF_BIRTH',
          'PERSONAL_ID',
          'DOCUMENT_NR',
          'EXPIRY_DATE',
          'PLACE_OF_BIRTH',
          'ISSUING_DATE',
          'PERMIT_TYPE',
          'REMARK1',
          'REMARK2',
          'REMARK3',
          'REMARK4',
        ];
        return new Promise(function (resolve, reject) {
          // Select MF
          transmit("00a4000400").then(function (response) {
            // Select EEEE
            return transmit("00a4000c");
          }).then(function (response) {
            return transmit("00a4010c02eeee");
          }).then(function (response) {
            return transmit("00a4020c025044");
          }).then(function (response) {
            var pd = [];
            for (var record in records) {
              pd.push(new Promise((resolve, reject) => {
                transmit(new Buffer([0x00,0xB2,parseInt(record) + 1,0x04,0x00,])).then(function (r) {
                  resolve(r);
                });
              }));
            }
            return Promise.all(pd);
          }).then(function (pd) {
            var persodata = {};
            for (var a in pd) {
              var recordvalue = pd[a].slice(0, pd[a].length - 2);
              persodata[records[a]] = recordvalue.length == 1 && recordvalue[0] == 0x00 ? "" : recordvalue.toString('latin1').trim();
            }
            resolve(persodata);
          });
        });
      };
      return eid;
    };

    fields.VERSION = VERSION;
    fields.ATRS = ATRS;
    return fields;
  };

  // Register
  if (typeof (exports) !== 'undefined') {
    // nodejs
    if (typeof module !== 'undefined' && module.exports) {
      exports = module.exports = esteid();
    } else {
      exports.esteid = esteid();
    }
  }
})();
