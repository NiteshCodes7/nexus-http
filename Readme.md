# nexus-http

[![npm version](https://img.shields.io/npm/v/nexus-http.svg)](https://www.npmjs.com/package/nexus-http)
[![npm downloads](https://img.shields.io/npm/dm/nexus-http.svg)](https://www.npmjs.com/package/nexus-http)
[![bundle size](https://img.shields.io/bundlephobia/minzip/nexus-http)](https://bundlephobia.com/package/nexus-http)
[![license](https://img.shields.io/npm/l/nexus-http.svg)](https://github.com/yourusername/nexus-http/blob/main/LICENSE)

> A powerful, zero-dependency HTTP client with built-in caching, retries, deduplication, streaming, upload progress, offline support, metrics, middleware, and plugins — for both Node.js and the browser.

---

## Table of contents

- [Installation](#installation)
- [Quick start](#quick-start)
- [CommonJS vs ESM](#commonjs-vs-esm)
- [Creating an instance](#creating-an-instance)
- [HTTP methods](#http-methods)
- [Request config](#request-config)
- [Response object](#response-object)
- [Caching](#caching)
- [Auto retry](#auto-retry)
- [Request deduplication](#request-deduplication)
- [Concurrency control](#concurrency-control)
- [Offline support](#offline-support)
- [Streaming](#streaming)
- [File upload with progress](#file-upload-with-progress)
- [Interceptors](#interceptors)
- [Middleware](#middleware)
- [Plugins](#plugins)
- [Metrics](#metrics)
- [Parallel requests](#parallel-requests)
- [TypeScript](#typescript)
- [vs Axios](#vs-axios)

---

## Installation

```bash
# npm
npm install nexus-http

# yarn
yarn add nexus-http

# pnpm
pnpm add nexus-http
```

**Requirements:** Node.js 18+ or any modern browser. Zero dependencies.

---

## Quick start

### CommonJS

```js
const nexus = require('nexus-http');

const { data } = await nexus.get('https://api.example.com/users');
console.log(data);
```

### ESM

```js
import nexus from 'nexus-http';

const { data } = await nexus.get('https://api.example.com/users');
console.log(data);
```

---

## CommonJS vs ESM

nexus-http supports both module systems out of the box.

### CommonJS (Node.js require)

```js
// default instance
const nexus = require('nexus-http');

// named exports
const { NexusHTTP, NexusError, create, LoggerPlugin, AuthPlugin, CachePlugin } = require('nexus-http');
```

### ESM (import)

```js
// default instance
import nexus from 'nexus-http';

// named exports
import { NexusHTTP, NexusError, create, LoggerPlugin, AuthPlugin, CachePlugin } from 'nexus-http';

// mix default and named
import nexus, { create, NexusError } from 'nexus-http';
```

### ESM in the browser via CDN

```html
<script type="module">
  import nexus from 'https://cdn.jsdelivr.net/npm/nexus-http/dist/index.mjs';

  const { data } = await nexus.get('https://api.example.com/users');
  console.log(data);
</script>
```

---

## Creating an instance

The default export is a ready-to-use instance. For most apps, create your own instance with `create()` so you can set a base URL, default headers, and other options once.

### CommonJS

```js
const { create } = require('nexus-http');

const api = create({
  baseURL: 'https://api.example.com',
  timeout: 5000,
  headers: { 'X-App-Version': '1.0.0' },
  maxRetries: 3,
  maxConcurrent: 10,
  cache: false,
  cacheTTL: 60000
});
```

### ESM

```js
import { create } from 'nexus-http';

const api = create({
  baseURL: 'https://api.example.com',
  timeout: 5000,
  headers: { 'X-App-Version': '1.0.0' },
  maxRetries: 3,
  maxConcurrent: 10,
  cache: false,
  cacheTTL: 60000
});
```

### Config options

| Option | Type | Default | Description |
|---|---|---|---|
| `baseURL` | `string` | `''` | Root URL prepended to every request |
| `timeout` | `number` | `10000` | Request timeout in milliseconds |
| `headers` | `object` | `{ 'Content-Type': 'application/json' }` | Default headers sent with every request |
| `maxRetries` | `number` | `3` | Max retry attempts on failure |
| `maxConcurrent` | `number` | `10` | Max simultaneous requests |
| `cache` | `boolean` | `false` | Enable response caching globally |
| `cacheTTL` | `number` | `60000` | Cache time-to-live in milliseconds |

---

## HTTP methods

```js
import { create } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

const { data } = await api.get('/users');
const { data } = await api.post('/users', { name: 'Alice' });
const { data } = await api.put('/users/1', { name: 'Alice Updated' });
const { data } = await api.patch('/users/1', { active: false });
const { data } = await api.delete('/users/1');
const { headers } = await api.head('/users');
const { data } = await api.options('/users');
```

---

## Request config

Every method accepts an optional config object as the last argument.

```js
import { create } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

const { data } = await api.get('/users', {
  // query string — appended to URL as ?page=1&limit=10
  params: { page: 1, limit: 10 },

  // per-request headers — merged with instance headers
  headers: { 'X-Request-Source': 'dashboard' },

  // override instance timeout for this request only
  timeout: 3000,

  // override retry count for this request only
  retries: 1,

  // which status codes to retry on
  retryOn: [429, 503],

  // cache this request for 30 seconds
  cache: true,
  cacheTTL: 30000,

  // disable deduplication for this request
  dedupe: false
});
```

---

## Response object

Every request resolves to a consistent response object.

```js
import nexus from 'nexus-http';

const response = await nexus.get('https://api.example.com/users');

response.data        // parsed body — JS object, string, or Blob
response.status      // HTTP status code — 200, 201, 404 etc
response.statusText  // status text — 'OK', 'Not Found' etc
response.headers     // response headers as a plain object
response.duration    // how long the request took in ms
response.url         // full URL that was requested
response.fromCache   // true if this came from cache, false if from network
```

---

## Caching

Cache GET responses so repeated calls return instantly without hitting the network.

### Enable globally

```js
import { create } from 'nexus-http';

const api = create({
  baseURL: 'https://api.example.com',
  cache: true,
  cacheTTL: 30000  // 30 seconds
});

await api.get('/products');  // network request
await api.get('/products');  // instant cache hit ✅
```

### Enable per request

```js
const { data } = await api.get('/products', {
  cache: true,
  cacheTTL: 10000  // only cache this one for 10 seconds
});
```

### Clear cache

```js
// clear only /products entries
api.clearCache('/products');

// clear everything
api.clearCache();
```

### Via plugin

```js
import { create, CachePlugin } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });
api.use(CachePlugin({ ttl: 30000 }));
```

---

## Auto retry

Automatically retries failed requests with exponential backoff — 1s → 2s → 4s.

```js
import { create } from 'nexus-http';

const api = create({
  baseURL: 'https://api.example.com',
  maxRetries: 3
});

// retries automatically on 429 and 503 by default
await api.get('/unstable-endpoint');
```

### Custom status codes

```js
const { data } = await api.get('/users', {
  retries: 5,
  retryOn: [500, 502, 503]
});
```

Network errors (DNS failure, connection reset, no internet) are also retried automatically.

### Disable retries

```js
// no retries for this request
await api.get('/users', { retries: 0 });
```

---

## Request deduplication

When the same request fires multiple times simultaneously, only one network call is made. All callers receive the same response.

```js
import { create } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

// three components all fetch users at the same time
const [r1, r2, r3] = await Promise.all([
  api.get('/users'),
  api.get('/users'),
  api.get('/users')
]);

// only ONE network request was made
// all three got the same result ✅
```

Disable per request:

```js
await api.get('/users', { dedupe: false });
```

---

## Concurrency control

Limits simultaneous requests. Extras wait in a queue and run as slots free up.

```js
import { create } from 'nexus-http';

const api = create({
  baseURL: 'https://api.example.com',
  maxConcurrent: 3  // max 3 at once
});

// fire 10 at once — first 3 run, rest queue
const results = await api.all(
  Array.from({ length: 10 }, (_, i) => api.get(`/items/${i}`))
);
```

---

## Offline support

Requests made while offline are queued and automatically sent when the connection restores. Browser only.

```js
import { create } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

// device goes offline here
const { data } = await api.get('/users');
// ← caller is frozen here, not dropped

// device comes back online
// request fires automatically
// caller gets the response ✅
console.log(data);
```

---

## Streaming

Read response data chunk by chunk as it arrives. Perfect for AI text generation, live logs, and large file downloads.

### ESM

```js
import { create } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

// stream a GET endpoint
await api.stream('/logs', (chunk) => {
  process.stdout.write(chunk);
});

// stream a POST — AI generation example
await api.stream('/ai/generate', (chunk) => {
  document.getElementById('output').innerHTML += chunk;
}, {
  method: 'POST',
  data: { prompt: 'explain javascript closures' }
});
```

### CommonJS

```js
const { create } = require('nexus-http');

const api = create({ baseURL: 'https://api.example.com' });

await api.stream('/ai/chat', (chunk) => {
  process.stdout.write(chunk);
}, {
  method: 'POST',
  data: { message: 'hello' }
});
```

---

## File upload with progress

Upload files with real-time percentage progress.

### ESM

```js
import { create } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

const formData = new FormData();
formData.append('avatar', fileInput.files[0]);

const { data } = await api.upload(
  '/upload/avatar',
  formData,
  (percent) => {
    progressBar.style.width = `${percent}%`;
    console.log(`${percent}% uploaded`);
  }
);

console.log(data.url);  // URL of uploaded file
```

### CommonJS

```js
const { create } = require('nexus-http');

const api = create({ baseURL: 'https://api.example.com' });

const formData = new FormData();
formData.append('file', fileBuffer, 'report.pdf');

await api.upload('/files', formData, (percent) => {
  console.log(percent + '%');
});
```

The progress callback is optional:

```js
// upload without tracking progress
await api.upload('/upload', formData);
```

---

## Interceptors

Modify every request before it goes out and every response before it comes back.

### Request interceptor

```js
import { create } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

// add auth header to every request
api.addRequestInterceptor((config) => {
  config.headers['Authorization'] = `Bearer ${getToken()}`;
  return config;
});

// async interceptor — fetch a fresh token each time
api.addRequestInterceptor(async (config) => {
  const token = await refreshTokenIfExpired();
  config.headers['Authorization'] = `Bearer ${token}`;
  return config;
});
```

### Response interceptor

```js
// unwrap nested API response
api.addResponseInterceptor((response) => {
  response.data = response.data.result;
  return response;
});

// redirect on unauthorized
api.addResponseInterceptor((response) => {
  if (response.status === 401) window.location = '/login';
  return response;
});
```

### Chaining

```js
api
  .addRequestInterceptor(addAuth)
  .addRequestInterceptor(addCorrelationId)
  .addResponseInterceptor(logResponse)
  .addResponseInterceptor(unwrapData);
```

---

## Middleware

Middleware wraps the entire request lifecycle — you get access to both the request config AND the response in a single function. More powerful than interceptors for complex logic.

### Basic

```js
import { create } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

api.use(async (ctx, next) => {
  // before — ctx.config is the request
  console.log(`→ ${ctx.config.method} ${ctx.config.url}`);

  await next();  // ← HTTP request happens here

  // after — ctx.response is the response
  console.log(`← ${ctx.response.status} in ${ctx.response.duration}ms`);
});
```

### Timing middleware

```js
api.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  ctx.response.totalTime = Date.now() - start;
});
```

### Auth retry middleware

```js
// detect 401, refresh token, retry automatically
api.use(async (ctx, next) => {
  await next();

  if (ctx.response.status === 401) {
    const newToken = await refreshToken();
    ctx.config.headers['Authorization'] = `Bearer ${newToken}`;
    await next();  // retry with fresh token
  }
});
```

### Request blocker

```js
// block requests before they hit the network
api.use(async (ctx, next) => {
  if (!isLoggedIn()) {
    // set response manually — no network call made
    ctx.response = { status: 401, data: { error: 'Unauthorized' } };
    return;
  }
  await next();
});
```

### Middleware vs interceptors

| | Interceptor | Middleware |
|---|---|---|
| Sees request config | ✅ | ✅ |
| Sees response | ✅ (separate function) | ✅ (same function) |
| Can compare request + response | ❌ | ✅ |
| Can block request | ❌ | ✅ |
| Can retry request | ❌ | ✅ |
| Best for | header injection, data transform | logging, auth retry, blocking |

---

## Plugins

Plugins bundle related functionality into a single installable unit.

### Built-in plugins

#### LoggerPlugin

Logs every request and response automatically.

```js
import { create, LoggerPlugin } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });
api.use(LoggerPlugin);

// [NexusHTTP] → GET /users
// [NexusHTTP] ← 200 https://api.example.com/users (143ms)
```

#### AuthPlugin

Injects a Bearer token into every request. Accepts a string or an async function.

```js
import { create, AuthPlugin } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

// static token
api.use(AuthPlugin('my-token'));

// dynamic — called before every request
api.use(AuthPlugin(() => localStorage.getItem('token')));

// async — await is supported
api.use(AuthPlugin(async () => {
  const { token } = await getSession();
  return token;
}));
```

#### CachePlugin

Enables caching for all GET requests with a configurable TTL.

```js
import { create, CachePlugin } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });
api.use(CachePlugin({ ttl: 60000 }));  // cache for 1 minute
```

### Combining plugins

```js
import { create, LoggerPlugin, AuthPlugin, CachePlugin } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

api
  .use(LoggerPlugin)
  .use(AuthPlugin(() => getToken()))
  .use(CachePlugin({ ttl: 30000 }));
```

### Writing your own plugin

A plugin is any object with an `install(client)` method.

```js
import { create } from 'nexus-http';

const ErrorReportingPlugin = {
  install(client) {
    client.addResponseInterceptor((response) => {
      if (response.status >= 500) {
        sendToErrorTracker({
          url: response.url,
          status: response.status,
          duration: response.duration
        });
      }
      return response;
    });
  }
};

// factory plugin — accepts configuration
const RateLimitPlugin = (requestsPerSecond = 10) => ({
  install(client) {
    let count = 0;
    setInterval(() => { count = 0; }, 1000);

    client.use(async (ctx, next) => {
      if (count >= requestsPerSecond) {
        ctx.response = { status: 429, data: { error: 'Rate limit exceeded' } };
        return;
      }
      count++;
      await next();
    });
  }
});

const api = create({ baseURL: 'https://api.example.com' });
api.use(ErrorReportingPlugin);
api.use(RateLimitPlugin(5));  // max 5 requests per second
```

---

## Metrics

Track every request — response times, status codes, and full history.

```js
import { create } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

await api.get('/users');
await api.get('/posts');
await api.post('/users', { name: 'Alice' });
await api.get('/notfound');

const report = api.getMetrics();

console.log(report.total);      // 4
console.log(report.avgTime);    // 143  (ms)
console.log(report.byStatus);   // { 200: 2, 201: 1, 404: 1 }
console.log(report.history);    // full array of all 4 requests

// reset
api.clearMetrics();
```

### History entry

```js
report.history[0] = {
  url: 'https://api.example.com/users',
  method: 'GET',
  status: 200,
  duration: 143
}
```

---

## Parallel requests

### all() — run simultaneously, wait for all

```js
import { create } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

const [users, posts, comments] = await api.all([
  api.get('/users'),
  api.get('/posts'),
  api.get('/comments')
]);
// all three ran at the same time
// resolves when the LAST one finishes
```

### race() — run simultaneously, take the fastest

```js
const { data } = await api.race([
  api.get('/users?source=primary'),
  api.get('/users?source=replica')
]);
// resolves when the FIRST one finishes
```

---

## TypeScript

Full TypeScript support is built in. No `@types` package needed.

```ts
import { create, NexusResponse, NexusError, NexusConfig } from 'nexus-http';

// typed config
const config: NexusConfig = {
  baseURL: 'https://api.example.com',
  timeout: 5000
};

const api = create(config);

// typed response
interface User {
  id: number;
  name: string;
  email: string;
}

const { data } = await api.get<User>('/users/1');
data.name;   // ✅ string
data.email;  // ✅ string

// typed arrays
const { data: users } = await api.get<User[]>('/users');
users[0].name;  // ✅ string

// typed error handling
try {
  await api.delete('/users/999');
} catch (e) {
  if (e instanceof NexusError) {
    e.status;    // number | null
    e.response;  // NexusResponse | null
    e.config;    // RequestConfig | null
    e.message;   // string
  }
}
```

---

## vs Axios

| Feature | nexus-http | axios |
|---|---|---|
| Built-in caching | ✅ | ❌ |
| Auto retry + backoff | ✅ built-in | ❌ plugin needed |
| Request deduplication | ✅ | ❌ |
| Concurrency limiting | ✅ | ❌ |
| Offline request queue | ✅ | ❌ |
| SSE / Streaming | ✅ | ⚠️ limited |
| Upload with progress | ✅ | ✅ |
| Middleware pipeline | ✅ | ⚠️ interceptors only |
| Request metrics | ✅ | ❌ |
| Plugin system | ✅ | ⚠️ basic |
| ESM support | ✅ | ✅ |
| TypeScript | ✅ built-in | ✅ via @types |
| Bundle size | ~3kb | ~14kb |
| Zero dependencies | ✅ | ✅ |
| Node.js 18+ | ✅ | ✅ |
| Browser | ✅ | ✅ |

---

## License

MIT © [Your Name](https://github.com/yourusername)

---

## Contributing

Pull requests are welcome. For major changes please open an issue first.

```bash
git clone https://github.com/NiteshCodes7/nexus-http
cd nexus-http

# no install needed — zero dependencies

# run tests
node tests/index.test.js
```