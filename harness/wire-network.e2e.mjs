import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

// Wire fixtures exercise real loopback sockets, not either logger's implementation.
async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    base: 'http://127.0.0.1:' + server.address().port,
    close: () => new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())),
  };
}

async function withWire(run) {
  const delivered = [];
  const collector = await listen(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/collect') {
      res.writeHead(404).end();
      return;
    }
    let bytes = 0;
    let raw = '';
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 4096) {
        res.writeHead(413).end();
        return;
      }
      raw += chunk;
    }
    let record;
    try { record = JSON.parse(raw); } catch { res.writeHead(400).end(); return; }
    if (!/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(String(req.headers.traceparent))) {
      res.writeHead(422).end();
      return;
    }
    delivered.push({ record, tenant: req.headers['x-tenant'], auth: req.headers.authorization });
    res.writeHead(202).end();
  });
  const gateway = await listen(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/logs') {
      res.writeHead(404).end();
      return;
    }
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 4096) {
        res.writeHead(413).end();
        return;
      }
    }
    try {
      const data = JSON.parse(raw);
      if (typeof data.service !== 'string' || !/^[a-z0-9-]{1,32}$/.test(data.service)) {
        res.writeHead(422).end();
        return;
      }
    } catch {
      res.writeHead(400).end();
      return;
    }
    const upstream = await fetch(collector.base + '/collect', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        traceparent: String(req.headers.traceparent ?? ''),
        'x-tenant': String(req.headers['x-tenant'] ?? ''),
      },
      body: raw,
      signal: AbortSignal.timeout(3000),
    });
    res.writeHead(upstream.status).end();
  });
  try { await run(gateway.base, delivered); }
  finally { await gateway.close(); await collector.close(); }
}
const trace = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
const send = (base, tenant, traceparent = trace, data = {service:'demo',message:'synthetic'}) =>
  fetch(base + '/logs', {
    method:'POST',
    headers:{'x-tenant':tenant, traceparent, authorization:'Bearer synthetic-test-only'},
    body:JSON.stringify(data),
  });

test('HTTP client -> gateway -> collector preserves tenant and trace but drops authorization', async () => {
  await withWire(async (base, delivered) => {
    const responses = await Promise.all(['a', 'b', 'a'].map((tenant) => send(base, tenant)));
    assert.deepEqual(responses.map((r) => r.status), [202, 202, 202]);
    assert.deepEqual(delivered.map((x) => x.tenant).sort(), ['a', 'a', 'b']);
    assert.ok(delivered.every((x) => x.auth === undefined));
  });
});

test('invalid trace and tenant service syntax fail closed', async () => {
  await withWire(async (base, delivered) => {
    assert.equal((await send(base, 'a', 'broken')).status, 422);
    assert.equal((await send(base, 'a', trace, {service:'../other'})).status, 422);
    assert.equal(delivered.length, 0);
  });
});

test('oversized and malformed payloads never reach the collector', async () => {
  await withWire(async (base, delivered) => {
    const tooLarge = await send(base, 'a', trace, {service:'demo', payload:'x'.repeat(5000)});
    assert.equal(tooLarge.status, 413);
    const malformed = await fetch(base + '/logs', {method:'POST', body:'{'});
    assert.equal(malformed.status, 400);
    assert.equal(delivered.length, 0);
  });
});
