const assert = require('assert');
const Buffer = require('safe-buffer').Buffer;
const http = require('http');
const request = require('supertest');

const bodyParser = require('..');

describe('bodyParser.json()', function () {
  it('should parse JSON', function (done) {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"user":"tobi"}')
      .expect(200, '{"user":"tobi"}', done);
  });

  it('should handle Content-Length: 0', function (done) {
    request(createServer())
      .get('/')
      .set('Content-Type', 'application/json')
      .set('Content-Length', '0')
      .expect(200, '{}', done);
  });

  it('should handle empty message-body', function (done) {
    request(createServer())
      .get('/')
      .set('Content-Type', 'application/json')
      .set('Transfer-Encoding', 'chunked')
      .expect(200, '{}', done);
  });

  it('should handle empty message-body with emptyDefaultValue', function (done) {
    request(createServer({ emptyDefaultValue: '' }))
      .get('/')
      .set('Content-Type', 'application/json')
      .set('Transfer-Encoding', 'chunked')
      .expect(200, '""', done);
  });

  it('should handle no message-body', function (done) {
    request(createServer())
      .get('/')
      .set('Content-Type', 'application/json')
      .unset('Transfer-Encoding')
      .expect(200, 'undefined', done);
  });

  it('should 400 when invalid content-length', function (done) {
    const jsonParser = bodyParser.json();
    const server = createServer(function (req, res, next) {
      req.headers['content-length'] = '20'; // bad length
      jsonParser(req, res, next);
    });

    request(server)
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"str":')
      .expect(400, /content length/, done);
  });

  it('should handle duplicated middleware', function (done) {
    const jsonParser = bodyParser.json();
    const server = createServer(function (req, res, next) {
      jsonParser(req, res, function (err) {
        if (err) return next(err);
        jsonParser(req, res, next);
      });
    });

    request(server)
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"user":"tobi"}')
      .expect(200, '{"user":"tobi"}', done);
  });

  describe('when JSON is invalid', function () {
    before(function () {
      this.server = createServer();
    });

    it('should 400 for bad token', function (done) {
      request(this.server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{:')
        .expect(400, 'Bad Request', done);
    });

    it('should 400 for incomplete', function (done) {
      request(this.server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"user"')
        .expect(400, 'Bad Request', done);
    });

    it('should error with type = "entity.parse.failed"', function (done) {
      request(this.server)
        .post('/')
        .set('Content-Type', 'application/json')
        .set('X-Error-Property', 'type')
        .send(' {"user"')
        .expect(400, 'entity.parse.failed', done);
    });

    it('should include original body on error object', function (done) {
      request(this.server)
        .post('/')
        .set('Content-Type', 'application/json')
        .set('X-Error-Property', 'body')
        .send(' {"user"')
        .expect(400, ' {"user"', done);
    });
  });

  describe('with limit option', function () {
    it('should 413 when over limit with Content-Length', function (done) {
      const buf = Buffer.alloc(1024, '.');
      request(createServer({ limit: '1kb' }))
        .post('/')
        .set('Content-Type', 'application/json')
        .set('Content-Length', '1034')
        .send(JSON.stringify({ str: buf.toString() }))
        .expect(413, done);
    });

    it('should error with type = "entity.too.large"', function (done) {
      const buf = Buffer.alloc(1024, '.');
      request(createServer({ limit: '1kb' }))
        .post('/')
        .set('Content-Type', 'application/json')
        .set('Content-Length', '1034')
        .set('X-Error-Property', 'type')
        .send(JSON.stringify({ str: buf.toString() }))
        .expect(413, 'entity.too.large', done);
    });

    it('should 413 when over limit with chunked encoding', function (done) {
      const buf = Buffer.alloc(1024, '.');
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/json');
      test.set('Transfer-Encoding', 'chunked');
      test.write('{"str":');
      test.write('"' + buf.toString() + '"}');
      test.expect(413, done);
    });

    it('should 413 when inflated body over limit', function (done) {
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(
        Buffer.from(
          '1f8b080000000000000aab562a2e2952b252d21b05a360148c58a0540b0066f7ce1e0a040000',
          'hex',
        ),
      );
      test.expect(413, done);
    });

    it('should accept number of bytes', function (done) {
      const buf = Buffer.alloc(1024, '.');
      request(createServer({ limit: 1024 }))
        .post('/')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ str: buf.toString() }))
        .expect(413, done);
    });

    it('should not change when options altered', function (done) {
      const buf = Buffer.alloc(1024, '.');
      const options = { limit: '1kb' };
      const server = createServer(options);

      options.limit = '100kb';

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ str: buf.toString() }))
        .expect(413, done);
    });

    it('should not hang response', function (done) {
      const buf = Buffer.alloc(10240, '.');
      const server = createServer({ limit: '8kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/json');
      test.write(buf);
      test.write(buf);
      test.write(buf);
      test.expect(413, done);
    });
  });

  describe('with inflate option', function () {
    describe('when false', function () {
      before(function () {
        this.server = createServer({ inflate: false });
      });

      it('should not accept content-encoding', function (done) {
        const test = request(this.server).post('/');
        test.set('Content-Encoding', 'gzip');
        test.set('Content-Type', 'application/json');
        test.write(
          Buffer.from(
            '1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000',
            'hex',
          ),
        );
        test.expect(415, 'content encoding unsupported', done);
      });
    });

    describe('when true', function () {
      before(function () {
        this.server = createServer({ inflate: true });
      });

      it('should accept content-encoding', function (done) {
        const test = request(this.server).post('/');
        test.set('Content-Encoding', 'gzip');
        test.set('Content-Type', 'application/json');
        test.write(
          Buffer.from(
            '1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000',
            'hex',
          ),
        );
        test.expect(200, '{"name":"论"}', done);
      });
    });
  });

  describe('with strict option', function () {
    describe('when undefined', function () {
      before(function () {
        this.server = createServer();
      });

      it('should 400 on primitives', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('true')
          .expect(400, 'Strict syntax violation', done);
      });
    });

    describe('when false', function () {
      before(function () {
        this.server = createServer({ strict: false });
      });

      it('should parse primitives', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('true')
          .expect(200, 'true', done);
      });
    });

    describe('when true', function () {
      before(function () {
        this.server = createServer({ strict: true });
      });

      it('should not parse primitives', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('true')
          .expect(400, 'Strict syntax violation', done);
      });

      it('should not parse primitives with leading whitespaces', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('    true')
          .expect(400, 'Strict syntax violation', done);
      });

      it('should allow leading whitespaces in JSON', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('   { "user": "tobi" }')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should error with type = "entity.parse.failed"', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'application/json')
          .set('X-Error-Property', 'type')
          .send('true')
          .expect(400, 'entity.parse.failed', done);
      });

      it('should include correct message in stack trace', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'application/json')
          .set('X-Error-Property', 'stack')
          .send('true')
          .expect(400)
          .expect(shouldContainInBody('Strict syntax violation'))
          .end(done);
      });
    });
  });

  describe('with type option', function () {
    describe('when "application/vnd.api+json"', function () {
      before(function () {
        this.server = createServer({ type: 'application/vnd.api+json' });
      });

      it('should parse JSON for custom type', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'application/vnd.api+json')
          .send('{"user":"tobi"}')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should ignore standard type', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('{"user":"tobi"}')
          .expect(200, 'undefined', done);
      });
    });

    describe('when ["application/json", "application/vnd.api+json"]', function () {
      before(function () {
        this.server = createServer({
          type: ['application/json', 'application/vnd.api+json'],
        });
      });

      it('should parse JSON for "application/json"', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('{"user":"tobi"}')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should parse JSON for "application/vnd.api+json"', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'application/vnd.api+json')
          .send('{"user":"tobi"}')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should ignore "application/x-json"', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'application/x-json')
          .send('{"user":"tobi"}')
          .expect(200, 'undefined', done);
      });
    });

    describe('when a function', function () {
      it('should parse when truthy value returned', function (done) {
        const server = createServer({ type: accept });

        function accept(req) {
          return req.headers['content-type'] === 'application/vnd.api+json';
        }

        request(server)
          .post('/')
          .set('Content-Type', 'application/vnd.api+json')
          .send('{"user":"tobi"}')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should work without content-type', function (done) {
        const server = createServer({ type: accept });

        function accept(req) {
          return true;
        }

        const test = request(server).post('/');
        test.write('{"user":"tobi"}');
        test.expect(200, '{"user":"tobi"}', done);
      });

      it('should not invoke without a body', function (done) {
        const server = createServer({ type: accept });

        function accept(req) {
          throw new Error('oops!');
        }

        request(server).get('/').expect(200, done);
      });
    });
  });

  describe('with verify option', function () {
    it('should assert value if function', function () {
      assert.throws(
        createServer.bind(null, { verify: 'lol' }),
        /TypeError: option verify must be function/,
      );
    });

    it('should error from verify', function (done) {
      const server = createServer({
        verify: function (req, res, buf) {
          if (buf[0] === 0x5b) throw new Error('no arrays');
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('["tobi"]')
        .expect(403, 'no arrays', done);
    });

    it('should error with type = "entity.verify.failed"', function (done) {
      const server = createServer({
        verify: function (req, res, buf) {
          if (buf[0] === 0x5b) throw new Error('no arrays');
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .set('X-Error-Property', 'type')
        .send('["tobi"]')
        .expect(403, 'entity.verify.failed', done);
    });

    it('should allow custom codes', function (done) {
      const server = createServer({
        verify: function (req, res, buf) {
          if (buf[0] !== 0x5b) return;
          const err = new Error('no arrays');
          err.status = 400;
          throw err;
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('["tobi"]')
        .expect(400, 'no arrays', done);
    });

    it('should allow custom type', function (done) {
      const server = createServer({
        verify: function (req, res, buf) {
          if (buf[0] !== 0x5b) return;
          const err = new Error('no arrays');
          err.type = 'foo.bar';
          throw err;
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .set('X-Error-Property', 'type')
        .send('["tobi"]')
        .expect(403, 'foo.bar', done);
    });

    it('should include original body on error object', function (done) {
      const server = createServer({
        verify: function (req, res, buf) {
          if (buf[0] === 0x5b) throw new Error('no arrays');
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .set('X-Error-Property', 'body')
        .send('["tobi"]')
        .expect(403, '["tobi"]', done);
    });

    it('should allow pass-through', function (done) {
      const server = createServer({
        verify: function (req, res, buf) {
          if (buf[0] === 0x5b) throw new Error('no arrays');
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"user":"tobi"}')
        .expect(200, '{"user":"tobi"}', done);
    });

    it('should work with different charsets', function (done) {
      const server = createServer({
        verify: function (req, res, buf) {
          if (buf[0] === 0x5b) throw new Error('no arrays');
        },
      });

      const test = request(server).post('/');
      test.set('Content-Type', 'application/json; charset=utf-16');
      test.write(
        Buffer.from(
          'feff007b0022006e0061006d00650022003a00228bba0022007d',
          'hex',
        ),
      );
      test.expect(200, '{"name":"论"}', done);
    });

    it('should 415 on unknown charset prior to verify', function (done) {
      const server = createServer({
        verify: function (req, res, buf) {
          throw new Error('unexpected verify call');
        },
      });

      const test = request(server).post('/');
      test.set('Content-Type', 'application/json; charset=x-bogus');
      test.write(Buffer.from('00000000', 'hex'));
      test.expect(415, 'unsupported charset "X-BOGUS"', done);
    });
  });

  describe('charset', function () {
    before(function () {
      this.server = createServer();
    });

    it('should parse utf-8', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'application/json; charset=utf-8');
      test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });

    it('should parse utf-16', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'application/json; charset=utf-16');
      test.write(
        Buffer.from(
          'feff007b0022006e0061006d00650022003a00228bba0022007d',
          'hex',
        ),
      );
      test.expect(200, '{"name":"论"}', done);
    });

    it('should parse when content-length != char length', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'application/json; charset=utf-8');
      test.set('Content-Length', '13');
      test.write(Buffer.from('7b2274657374223a22c3a5227d', 'hex'));
      test.expect(200, '{"test":"å"}', done);
    });

    it('should default to utf-8', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });

    it('should fail on unknown charset', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'application/json; charset=koi8-r');
      test.write(Buffer.from('7b226e616d65223a22cec5d4227d', 'hex'));
      test.expect(415, 'unsupported charset "KOI8-R"', done);
    });

    it('should error with type = "charset.unsupported"', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'application/json; charset=koi8-r');
      test.set('X-Error-Property', 'type');
      test.write(Buffer.from('7b226e616d65223a22cec5d4227d', 'hex'));
      test.expect(415, 'charset.unsupported', done);
    });
  });

  describe('encoding', function () {
    before(function () {
      this.server = createServer({ limit: '1kb' });
    });

    it('should parse without encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });

    it('should support identity encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'identity');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex'));
      test.expect(200, '{"name":"论"}', done);
    });

    it('should support gzip encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(
        Buffer.from(
          '1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000',
          'hex',
        ),
      );
      test.expect(200, '{"name":"论"}', done);
    });

    it('should support deflate encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'deflate');
      test.set('Content-Type', 'application/json');
      test.write(
        Buffer.from('789cab56ca4bcc4d55b2527ab16e97522d00274505ac', 'hex'),
      );
      test.expect(200, '{"name":"论"}', done);
    });

    it('should be case-insensitive', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'GZIP');
      test.set('Content-Type', 'application/json');
      test.write(
        Buffer.from(
          '1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000',
          'hex',
        ),
      );
      test.expect(200, '{"name":"论"}', done);
    });

    it('should 415 on unknown encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'nulls');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('000000000000', 'hex'));
      test.expect(415, 'unsupported content encoding "nulls"', done);
    });

    it('should error with type = "encoding.unsupported"', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'nulls');
      test.set('Content-Type', 'application/json');
      test.set('X-Error-Property', 'type');
      test.write(Buffer.from('000000000000', 'hex'));
      test.expect(415, 'encoding.unsupported', done);
    });

    it('should 400 on malformed encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(
        Buffer.from(
          '1f8b080000000000000bab56cc4d55b2527ab16e97522d00515be1cc0e000000',
          'hex',
        ),
      );
      test.expect(400, done);
    });

    it('should 413 when inflated value exceeds limit', function (done) {
      // gzip'd data exceeds 1kb, but deflated below 1kb
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(
        Buffer.from(
          '1f8b080000000000000bedc1010d000000c2a0f74f6d0f071400000000000000',
          'hex',
        ),
      );
      test.write(
        Buffer.from(
          '0000000000000000000000000000000000000000000000000000000000000000',
          'hex',
        ),
      );
      test.write(Buffer.from('0000000000000000004f0625b3b71650c30000', 'hex'));
      test.expect(413, done);
    });
  });
});

function createServer(opts) {
  const _bodyParser = typeof opts !== 'function' ? bodyParser.json(opts) : opts;

  return http.createServer(function (req, res) {
    _bodyParser(req, res, function (err) {
      if (err) {
        res.statusCode = err.status || 500;
        res.end(err[req.headers['x-error-property'] || 'message']);
      } else {
        res.statusCode = 200;
        res.end(JSON.stringify(req.body) || typeof req.body);
      }
    });
  });
}

function shouldContainInBody(str) {
  return function (res) {
    assert.ok(
      res.text.indexOf(str) !== -1,
      "expected '" + res.text + "' to contain '" + str + "'",
    );
  };
}
