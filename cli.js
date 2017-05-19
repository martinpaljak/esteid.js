'use strict'
// Command line helpers
const readline = require('readline')

function openrl () {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })
}

function PIN (txt) {
  if (process.env[txt]) {
    return Promise.resolve(process.env[txt])
  } else {
    return new Promise(function (resolve, reject) {
      // Add a small timeout so that any pending console loggings would have time to write
      setTimeout(function () {
        var rl = openrl()
        rl.question('Please enter ' + txt + ': ', function (input) {
          rl.close()
          if (!input || input.trim() === '') { return reject(new Error('No PIN entered')) }
          return resolve(input)
        })
      }, 300)
    })
  }
}

function confirm (txt, def) {
  return new Promise(function (resolve, reject) {
    var rl = openrl()
    rl.question(txt + '? (y/n): ', function (input) {
      rl.close()
      if (!input || input.trim() === '') { return resolve(def) }
      return resolve('yes'.startsWith(input.toLowerCase()))
    })
  })
}

function PINString (value) {
  return Promise.resolve(value)
}

function centrify (txt) {
  if (typeof txt === 'string') { txt = txt.split('\n') }
  const maxlen = Math.max.apply(null, txt.map((x) => x.length))
  const padding = new Array(Math.ceil((process.stdout.columns - maxlen) / 2 * 0.8) + 1).join(' ')
  txt.map((x) => console.log(padding + x))
}

module.exports.PIN = PIN
module.exports.PINString = PINString
module.exports.centrify = centrify
module.exports.confirm = confirm
