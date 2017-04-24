'use strict'
// Command line helpers
const readline = require('readline')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function PIN (txt) {
  return new Promise(function (resolve, reject) {
    rl.question(txt + ': ', function (input) {
      if (!input || input.trim() === '') { return reject(new Error('No PIN entered')) }
      return resolve(input)
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
