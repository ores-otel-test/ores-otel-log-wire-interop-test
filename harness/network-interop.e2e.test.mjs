import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

// Transport-level regression fixtures. They do not run the canonical or
// legacy loggers: exact-source verification remains the separate conformance gate.
const TRACE = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';

async function serve(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return {
    url: 'http://127.0.0.1:' + server.address().port,
    close: () => new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve())),
  };
}

async function readBounded(req, maxBytes = 8192) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > maxBytes) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function chain(run) {
  const received = [];
  const seen = new Set();
  const collector = await serve(async (req, res) => {
    if (req.url !== '/v1/logs' || req.method !== 'POST') {
      res.writeHead(404).end();
      return;
    }
    const raw = await readBounded(req);
    if (raw === null) { res.writeHead(413).end(); return; }
    const tenant = req.headers['x-tenant'];
    const id = req.headers['x-log-id'];
    if (typeof tenant !== 'string' || typeof id !== 'string' ||
        !/^[a-z0-9-]{1,32}$/.test(tenant) || !/^[a-z0-9-]{1,32}$/.test(id) ||
        !/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/.test(String(req.headers.traceparent))) {
      res.writeHead(400).end();
      return;
    }
    const key = tenant + '/' + id;
    if (seen.has(key)) {
      res.writeHead(200).end('duplicate');
      return;
    }
    let record;
    try { record = JSON.parse(raw); } catch { res.writeHead(400).end(); return; }
    seen.add(key);
    received.push({ tenant, id, record, authorization: req.headers.authorization });
    res.writeHead(202).end('accepted');
  });
  const gateway = await serve(async (req, res) => {
    if (req.url !== '/ingest' || req.method !== 'POST') {
      res.writeHead(404).end();
      return;
    }
    const raw = await readBounded(req);
    if (raw === null) { res.writeHead(413).end(); return; }
    let record;
    try { record = JSON.parse(raw); } catch { res.writeHead(400).end(); return; }
    if (typeof record.service !== 'string' ||
        !/^[a-z0-9._-]{1,64}$/.test(record.service) ||
        typeof record.message !== 'string' || record.message.length > 1024 ||
        /[\r\n]/.test(record.message) || !['INFO', 'WARN', 'ERROR'].includes(record.level)) {
      res.writeHead(422).end();
      return;
    }
    const response = await fetch(collector.url + '/v1/logs', {
      method: 'POST', body: raw,
      headers: {
        'content-type': 'application/json',
        'x-tenant': String(req.headers['x-tenant'] ?? ''),
        'x-log-id': String(req.headers['x-log-id'] ?? ''),
        traceparent: String(req.headers.traceparent ?? ''),
      },
      signal: AbortSignal.timeout(5000),
    });
    res.writeHead(response.status).end(await response.text());
  });
  try { await run(gateway.url, received); }
  finally { await gateway.close(); await collector.close(); }
}

function send(base, tenant, id, record = { service: 'service-a', message: 'synthetic', level: 'INFO' }, traceparent = TRACE) {
  return fetch(base + '/ingest', {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'x-tenant': tenant,
      'x-log-id': id, traceparent, authorization: 'Bearer disposable-fixture',
    },
    body: JSON.stringify(record),
  });
}

test('HTTP client -> logger gateway -> collector preserves trace and tenant, drops auth', async () => {
  await chain(async (gateway, received) => {
    const results = await Promise.all([
      send(gateway, 'tenant-a', 'log-1'),
      send(gateway, 'tenant-b', 'log-1'),
      send(gateway, 'tenant-a', 'log-2'),
    ]);
    assert.deepEqual(results.map((r) => r.status), [202, 202, 202]);
    assert.equal(received.length, 3);
    assert.deepEqual(received.map((r) => r.tenant).sort(), ['tenant-a', 'tenant-a', 'tenant-b']);
    assert.ok(received.every((r) => r.authorization === undefined));
    assert.ok(received.every((r) => r.record.service === 'service-a'));
  });
});

test('idempotency is scoped per tenant; replay never duplicates collector records', async () => {
  await chain(async (gateway, received) => {
    assert.equal((await send(gateway, 'tenant-a', 'log-1')).status, 202);
    assert.equal((await send(gateway, 'tenant-a', 'log-1')).status, 200);
    assert.equal((await send(gateway, 'tenant-b', 'log-1')).status, 202);
    assert.equal(received.length, 2);
  });
});

test('malformed, newline-injected and oversized messages are denied before collector', async () => {
  await chain(async (gateway, received) => {
    for (const record of [
      { service: 'service-a', message: 'line1\r\nline2', level: 'INFO' },
      { service: '../invalid', message: 'synthetic', level: 'INFO' },
      { service: 'service-a', message: 'synthetic', level: 'DEBUG' },
    ]) assert.equal((await send(gateway, 'tenant-a', 'log-1', record)).status, 422);
    const tooBig = await send(gateway, 'tenant-a', 'log-big',
      { service: 'service-a', message: 'a'.repeat(9000), level: 'INFO' });
    assert.equal(tooBig.status, 413);
    assert.equal(received.length, 0);
  });
});

test('invalid traceparent is denied by collector and does not persist', async () => {
  await chain(async (gateway, received) => {
    assert.equal((await send(gateway, 'tenant-a', 'log-1', undefined, 'bad-trace')).status, 400);
    assert.equal(received.length, 0);
  });
});
