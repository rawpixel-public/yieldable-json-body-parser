/*!
 * yieldable-json-body-parser
 * Copyright(c) 2022 Vincent Baronnet
 * MIT Licensed
 */

const { parseAsync } = require('yieldable-json');

/**
 * Module dependencies.
 * @private
 */

const jsonParser = {
  parse: (body, reviver) =>
    new Promise((resolve, reject) =>
      parseAsync(body, reviver, 1, (err, result) =>
        err ? reject(err) : resolve(result),
      ),
    ),
};
/**
 * Module exports.
 */

module.exports = { jsonParser };
