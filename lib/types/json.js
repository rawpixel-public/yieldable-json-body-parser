/*!
 * body-parser
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * Copyright(c) 2022 Vincent Baronnet
 * MIT Licensed
 */

/**
 * Module dependencies.
 * @private
 */

const bytes = require('bytes');
const contentType = require('content-type');
const createError = require('http-errors');
const isFinished = require('on-finished').isFinished;
const read = require('../read');
const typeis = require('type-is');
const { jsonParser } = require('../parser');

/**
 * Module exports.
 */

module.exports = json;

/**
 * RegExp to match the first non-space in a string.
 *
 * Allowed whitespace is defined in RFC 7159:
 *
 *    ws = *(
 *            %x20 /              ; Space
 *            %x09 /              ; Horizontal tab
 *            %x0A /              ; Line feed or New line
 *            %x0D )              ; Carriage return
 */

const FIRST_CHAR_REGEXP = /^[\x20\x09\x0a\x0d]*(.)/; // eslint-disable-line no-control-regex

/**
 * Create a middleware to parse JSON bodies.
 *
 * @param {object} [options]
 * @return {function}
 * @public
 */

function json(options) {
  const opts = options || {};

  const limit =
    typeof opts.limit !== 'number'
      ? bytes.parse(opts.limit || '100kb')
      : opts.limit;
  const inflate = opts.inflate !== false;
  const reviver = opts.reviver;
  const strict = opts.strict !== false;
  const type = opts.type || 'application/json';
  const verify = opts.verify || false;
  const emptyDefaultValue =
    typeof opts.emptyDefaultValue !== 'undefined' ? opts.emptyDefaultValue : {};

  if (verify !== false && typeof verify !== 'function') {
    throw new TypeError('option verify must be function');
  }

  // create the appropriate type checking function
  const shouldParse = typeof type !== 'function' ? typeChecker(type) : type;

  async function parse(body) {
    if (body.length === 0) {
      // special-case empty json body, as it's a common client-side mistake
      return emptyDefaultValue;
    }

    if (strict) {
      const first = firstchar(body);
      if (first !== '{' && first !== '[') {
        throw new SyntaxError('Strict syntax violation');
      }
    }

    try {
      const json = await jsonParser.parse(body, reviver);
      return json;
    } catch (e) {
      throw normalizeJsonSyntaxError(e, {
        message: e.message,
        stack: e.stack,
      });
    }
  }

  return function jsonParser(req, res, next) {
    if (isFinished(req)) {
      next();
      return;
    }

    if (!('body' in req)) {
      req.body = undefined;
    }

    // skip requests without bodies
    if (!typeis.hasBody(req)) {
      next();
      return;
    }

    // determine if request should be parsed
    if (!shouldParse(req)) {
      next();
      return;
    }

    // assert charset per RFC 7159 sec 8.1
    const charset = getCharset(req) || 'utf-8';
    if (charset.substr(0, 4) !== 'utf-') {
      next(
        createError(
          415,
          'unsupported charset "' + charset.toUpperCase() + '"',
          {
            charset,
            type: 'charset.unsupported',
          },
        ),
      );
      return;
    }

    // read
    read(req, res, next, parse, {
      encoding: charset,
      inflate,
      limit,
      verify,
    });
  };
}

/**
 * Get the first non-whitespace character in a string.
 *
 * @param {string} str
 * @return {function}
 * @private
 */

function firstchar(str) {
  return FIRST_CHAR_REGEXP.exec(str)[1];
}

/**
 * Get the charset of a request.
 *
 * @param {object} req
 * @api private
 */

function getCharset(req) {
  try {
    return (contentType.parse(req).parameters.charset || '').toLowerCase();
  } catch (e) {
    return undefined;
  }
}

/**
 * Normalize a SyntaxError for JSON.parse.
 *
 * @param {SyntaxError} error
 * @param {object} obj
 * @return {SyntaxError}
 */

function normalizeJsonSyntaxError(error, obj) {
  const keys = Object.getOwnPropertyNames(error);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key !== 'stack' && key !== 'message') {
      delete error[key];
    }
  }

  error.message = obj.message;

  return error;
}

/**
 * Get the simple type checker.
 *
 * @param {string} type
 * @return {function}
 */

function typeChecker(type) {
  return function checkType(req) {
    return Boolean(typeis(req, type));
  };
}
