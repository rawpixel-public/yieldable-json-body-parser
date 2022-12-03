/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * Copyright(c) 2022 Vincent Baronnet
 * MIT Licensed
 */

/**
 * Cache of loaded parsers.
 * @private
 */

const parsers = Object.create(null);

/**
 * @typedef Parsers
 * @type {function}
 * @property {function} json
 */

/**
 * Module exports.
 * @type {Parsers}
 */

/**
 * JSON parser.
 * @public
 */

Object.defineProperty(module.exports, 'json', {
  configurable: true,
  enumerable: true,
  get: createParserGetter('json'),
});

/**
 * Create a getter for loading a parser.
 * @private
 */

function createParserGetter(name) {
  return function get() {
    return loadParser(name);
  };
}

/**
 * Load a parser module.
 * @private
 */

function loadParser(parserName) {
  let parser = parsers[parserName];

  if (parser !== undefined) {
    return parser;
  }

  // this uses a switch for static require analysis
  switch (parserName) {
    case 'json':
      parser = require('./lib/types/json');
      break;
  }

  // store to prevent invoking require()
  return (parsers[parserName] = parser);
}
