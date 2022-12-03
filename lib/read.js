/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

/**
 * Module dependencies.
 * @private
 */

const createError = require('http-errors');
const getBody = require('raw-body');
const iconv = require('iconv-lite');
const onFinished = require('on-finished');
const zlib = require('zlib');

/**
 * Module exports.
 */

module.exports = read;

/**
 * Read a request into a buffer and parse.
 *
 * @param {object} req
 * @param {object} res
 * @param {function} next
 * @param {function} parse
 * @param {object} options
 * @private
 */

function read(req, res, next, parse, options) {
  let length;
  const opts = options;
  let stream;

  // read options
  const encoding = opts.encoding !== null ? opts.encoding : null;
  const verify = opts.verify;

  try {
    // get the content stream
    stream = contentstream(req, opts.inflate);
    length = stream.length;
    stream.length = undefined;
  } catch (err) {
    return next(err);
  }

  // set raw-body options
  opts.length = length;
  opts.encoding = verify ? null : encoding;

  // assert charset is supported
  if (
    opts.encoding === null &&
    encoding !== null &&
    !iconv.encodingExists(encoding)
  ) {
    return next(
      createError(415, 'unsupported charset "' + encoding.toUpperCase() + '"', {
        charset: encoding.toLowerCase(),
        type: 'charset.unsupported',
      }),
    );
  }

  // read body
  getBody(stream, opts, function (error, body) {
    if (error) {
      let _error;

      if (error.type === 'encoding.unsupported') {
        // echo back charset
        _error = createError(
          415,
          'unsupported charset "' + encoding.toUpperCase() + '"',
          {
            charset: encoding.toLowerCase(),
            type: 'charset.unsupported',
          },
        );
      } else {
        // set status code on error
        _error = createError(400, error);
      }

      // read off entire request
      stream.resume();
      onFinished(req, function onfinished() {
        next(createError(400, _error));
      });
      return;
    }

    // verify
    if (verify) {
      try {
        verify(req, res, body, encoding);
      } catch (err) {
        next(
          createError(403, err, {
            body,
            type: err.type || 'entity.verify.failed',
          }),
        );
        return;
      }
    }

    // parse
    let str = body;
    try {
      str =
        typeof body !== 'string' && encoding !== null
          ? iconv.decode(body, encoding)
          : body;
    } catch (err) {
      next(
        createError(400, err, {
          body: str,
          type: err.type || 'entity.parse.failed',
        }),
      );
      return;
    }

    req.body = parse(str)
      .then((body) => {
        req.body = body;
        next();
      })
      .catch((err) => {
        next(
          createError(400, err, {
            body: str,
            type: err.type || 'entity.parse.failed',
          }),
        );
      });
  });
}

/**
 * Get the content stream of the request.
 *
 * @param {object} req
 * @param {boolean} [inflate=true]
 * @return {object}
 * @api private
 */

function contentstream(req, inflate) {
  const encoding = (
    req.headers['content-encoding'] || 'identity'
  ).toLowerCase();
  const length = req.headers['content-length'];
  let stream;

  if (inflate === false && encoding !== 'identity') {
    throw createError(415, 'content encoding unsupported', {
      encoding,
      type: 'encoding.unsupported',
    });
  }

  switch (encoding) {
    case 'deflate':
      stream = zlib.createInflate();
      req.pipe(stream);
      break;
    case 'gzip':
      stream = zlib.createGunzip();
      req.pipe(stream);
      break;
    case 'identity':
      stream = req;
      stream.length = length;
      break;
    default:
      throw createError(
        415,
        'unsupported content encoding "' + encoding + '"',
        {
          encoding,
          type: 'encoding.unsupported',
        },
      );
  }

  return stream;
}
