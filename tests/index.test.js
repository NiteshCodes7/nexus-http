// tests/index.test.js
// Run with: node tests/index.test.js

const { NexusHTTP, NexusError, LoggerPlugin, AuthPlugin, CachePlugin, create } = require('../src/index.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
  return fn()
    .then(() => { console.log(`  ✅ ${name}`); passed++; })
    .catch((e) => { console.log(`  ❌ ${name}: ${e.message}`); failed++; });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

// ─── Mock fetch ──────────────────────────────────────────────────────────────
let mockResponse = null;

global.fetch = async (url, options) => {
  if (mockResponse) return mockResponse(url, options);
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: new Map([['content-type', 'application/json']]),
    json: async () => ({ success: true }),
    text: async () => '',
    blob: async () => new Blob(),
  };
};

// Headers map polyfill
class FakeHeaders extends Map {
  get(key) { return super.get(key.toLowerCase()); }
  entries() { return super.entries(); }
}

function makeFakeResponse(status, body, contentType = 'application/json', ok = true) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    headers: new FakeHeaders([['content-type', contentType]]),
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    blob: async () => new Blob(),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n🧪 NexusHTTP Test Suite\n');

  // 1. Basic GET
  console.log('── Basic Requests');
  await test('GET request returns data', async () => {
    mockResponse = () => makeFakeResponse(200, { id: 1, name: 'Alice' });
    const client = create({ baseURL: 'https://api.test.com' });
    const res = await client.get('/users/1');
    assert(res.status === 200, 'Status should be 200');
    assert(res.data.name === 'Alice', 'Data should have name');
    assert(typeof res.duration === 'number', 'Should have duration');
    assert(res.fromCache === false, 'Should not be from cache');
  });

  await test('POST request sends data', async () => {
    let capturedBody = null;
    mockResponse = (url, opts) => {
      capturedBody = JSON.parse(opts.body);
      return makeFakeResponse(201, { id: 99 });
    };
    const client = create({ baseURL: 'https://api.test.com' });
    const res = await client.post('/users', { name: 'Bob' });
    assert(capturedBody.name === 'Bob', 'Body should be sent');
    assert(res.status === 201, 'Status should be 201');
  });

  await test('DELETE request works', async () => {
    mockResponse = () => makeFakeResponse(204, {});
    const client = create({ baseURL: 'https://api.test.com' });
    const res = await client.delete('/users/1');
    assert(res.status === 204, 'Status should be 204');
  });

  // 2. Caching
  console.log('\n── Caching');
  await test('Caches GET responses', async () => {
    let callCount = 0;
    mockResponse = () => { callCount++; return makeFakeResponse(200, { value: 42 }); };
    const client = create({ baseURL: 'https://api.test.com', cache: true, cacheTTL: 5000 });
    await client.get('/cached');
    await client.get('/cached');
    assert(callCount === 1, `Fetch should be called once, got ${callCount}`);
  });

  await test('Cache returns fromCache=true on hit', async () => {
    mockResponse = () => makeFakeResponse(200, { x: 1 });
    const client = create({ baseURL: 'https://api.test.com', cache: true, cacheTTL: 5000 });
    await client.get('/item');
    const res2 = await client.get('/item');
    assert(res2.fromCache === true, 'Second response should be from cache');
  });

  await test('clearCache removes cached entries', async () => {
    let callCount = 0;
    mockResponse = () => { callCount++; return makeFakeResponse(200, {}); };
    const client = create({ baseURL: 'https://api.test.com', cache: true, cacheTTL: 5000 });
    await client.get('/clear-test');
    client.clearCache('/clear-test');
    await client.get('/clear-test');
    assert(callCount === 2, `Should fetch twice after cache clear, got ${callCount}`);
  });

  // 3. Deduplication
  console.log('\n── Deduplication');
  await test('Deduplicates concurrent identical requests', async () => {
    let callCount = 0;
    mockResponse = async () => {
      callCount++;
      await new Promise(r => setTimeout(r, 20));
      return makeFakeResponse(200, {});
    };
    const client = create({ baseURL: 'https://api.test.com' });
    await Promise.all([client.get('/dedup'), client.get('/dedup'), client.get('/dedup')]);
    assert(callCount === 1, `Should deduplicate to 1 call, got ${callCount}`);
  });

  // 4. Interceptors
  console.log('\n── Interceptors');
  await test('Request interceptor modifies config', async () => {
    let capturedHeaders = null;
    mockResponse = (url, opts) => { capturedHeaders = opts.headers; return makeFakeResponse(200, {}); };
    const client = create({ baseURL: 'https://api.test.com' });
    client.addRequestInterceptor((config) => {
      config.headers = { ...config.headers, 'X-Custom': 'test-value' };
      return config;
    });
    await client.get('/intercepted');
    assert(capturedHeaders['X-Custom'] === 'test-value', 'Header should be injected');
  });

  await test('Response interceptor modifies response', async () => {
    mockResponse = () => makeFakeResponse(200, { raw: true });
    const client = create({ baseURL: 'https://api.test.com' });
    client.addResponseInterceptor((res) => {
      res.data.modified = true;
      return res;
    });
    const res = await client.get('/modified');
    assert(res.data.modified === true, 'Response should be modified');
  });

  // 5. Error handling
  console.log('\n── Error Handling');
  await test('Throws NexusError on 404', async () => {
    mockResponse = () => makeFakeResponse(404, { message: 'Not found' }, 'application/json', false);
    const client = create({ baseURL: 'https://api.test.com', maxRetries: 0 });
    try {
      await client.get('/notfound');
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e instanceof NexusError, 'Should be NexusError');
      assert(e.status === 404, 'Status should be 404');
    }
  });

  await test('Throws NexusError on 500', async () => {
    mockResponse = () => makeFakeResponse(500, { error: 'Server error' }, 'application/json', false);
    const client = create({ baseURL: 'https://api.test.com', maxRetries: 0 });
    try {
      await client.get('/error');
      assert(false, 'Should have thrown');
    } catch (e) {
      assert(e instanceof NexusError, 'Should be NexusError');
      assert(e.status === 500, 'Status should be 500');
    }
  });

  // 6. Plugins
  console.log('\n── Plugins');
  await test('AuthPlugin adds Authorization header', async () => {
    let capturedHeaders = null;
    mockResponse = (url, opts) => { capturedHeaders = opts.headers; return makeFakeResponse(200, {}); };
    const client = create({ baseURL: 'https://api.test.com' });
    client.use(AuthPlugin('my-secret-token'));
    await client.get('/protected');
    assert(capturedHeaders['Authorization'] === 'Bearer my-secret-token', 'Auth header should be set');
  });

  await test('CachePlugin enables caching', async () => {
    let callCount = 0;
    mockResponse = () => { callCount++; return makeFakeResponse(200, {}); };
    const client = create({ baseURL: 'https://api.test.com' });
    client.use(CachePlugin({ ttl: 5000 }));
    await client.get('/plugin-cached');
    await client.get('/plugin-cached');
    assert(callCount === 1, `Should cache via plugin, got ${callCount} calls`);
  });

  // 7. Metrics
  console.log('\n── Metrics');
  await test('Tracks request metrics', async () => {
    mockResponse = () => makeFakeResponse(200, {});
    const client = create({ baseURL: 'https://api.test.com' });
    await client.get('/m1');
    await client.get('/m2');
    const metrics = client.getMetrics();
    assert(metrics.total === 2, `Should track 2 requests, got ${metrics.total}`);
    assert(typeof metrics.avgTime === 'number', 'Should have avgTime');
    assert(metrics.byStatus[200] === 2, 'Should count 2 x 200');
  });

  await test('clearMetrics resets tracking', async () => {
    mockResponse = () => makeFakeResponse(200, {});
    const client = create({ baseURL: 'https://api.test.com' });
    await client.get('/metric');
    client.clearMetrics();
    assert(client.getMetrics().total === 0, 'Should have 0 after clear');
  });

  // 8. Middleware
  console.log('\n── Middleware');
  await test('Middleware pipeline runs in order', async () => {
    mockResponse = () => makeFakeResponse(200, {});
    const log = [];
    const client = create({ baseURL: 'https://api.test.com' });
    client.use(async (ctx, next) => { log.push('before-1'); await next(); log.push('after-1'); });
    client.use(async (ctx, next) => { log.push('before-2'); await next(); log.push('after-2'); });
    await client.get('/mw');
    assert(JSON.stringify(log) === JSON.stringify(['before-1', 'before-2', 'after-2', 'after-1']),
      `Middleware order wrong: ${JSON.stringify(log)}`);
  });

  // 9. Parallel
  console.log('\n── Parallel Requests');
  await test('all() resolves all requests', async () => {
    mockResponse = () => makeFakeResponse(200, { ok: true });
    const client = create({ baseURL: 'https://api.test.com' });
    const results = await client.all([client.get('/a'), client.get('/b'), client.get('/c')]);
    assert(results.length === 3, 'Should resolve 3 requests');
    assert(results.every(r => r.status === 200), 'All should be 200');
  });

  // 10. create() factory
  console.log('\n── Instance Factory');
  await test('create() makes independent instances', async () => {
    mockResponse = () => makeFakeResponse(200, {});
    const a = create({ baseURL: 'https://a.com', timeout: 1000 });
    const b = create({ baseURL: 'https://b.com', timeout: 2000 });
    assert(a.baseURL !== b.baseURL, 'Instances should have different baseURLs');
    assert(a.timeout !== b.timeout, 'Instances should have different timeouts');
  });

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed === 0) console.log('🎉 All tests passed!\n');
  else console.log('⚠️  Some tests failed.\n');
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((e) => { console.error('Test runner error:', e); process.exit(1); });