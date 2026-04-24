# nexus-http

> A powerful, zero-dependency HTTP client that beats axios — with built-in caching, retries, deduplication, streaming, upload progress, offline support, metrics, middleware, and plugins.

## Install

```bash
npm install nexus-http
```

## Quick Start

```js
const nexus = require('nexus-http');

const { data } = await nexus.get('https://api.example.com/users');
```

## Create an Instance

```js
const { create } = require('nexus-http');

const api = create({
  baseURL: 'https://api.example.com',
  timeout: 5000,
  headers: { 'X-App-Version': '1.0.0' },
  maxRetries: 3,
  cache: true,
  cacheTTL: 60000,
});
```

## HTTP Methods

```js
api.get('/users');
api.post('/users', { name: 'Alice' });
api.put('/users/1', { name: 'Alice Updated' });
api.patch('/users/1', { active: false });
api.delete('/users/1');
```

## Caching

```js
// Enable globally
const api = create({ cache: true, cacheTTL: 30000 });

// Or per request
api.get('/products', { cache: true, cacheTTL: 10000 });

// Clear cache
api.clearCache('/products'); // specific
api.clearCache();            // all
```

## Auto Retry with Backoff

```js
const api = create({ maxRetries: 3 }); // retries on network errors + 429/503

// Custom retry targets
api.get('/flaky', { retries: 5, retryOn: [500, 502, 503] });
```

## Request Deduplication

```js
// These 3 concurrent calls → only 1 network request
Promise.all([api.get('/me'), api.get('/me'), api.get('/me')]);
```

## Streaming (SSE / AI responses)

```js
await api.stream('/ai/chat', (chunk) => {
  process.stdout.write(chunk);
});
```

## Upload with Progress

```js
const formData = new FormData();
formData.append('file', fileBlob);

await api.upload('/upload', formData, (percent) => {
  console.log(`${percent}% uploaded`);
});
```

## Interceptors

```js
// Inject auth token on every request
api.addRequestInterceptor((config) => {
  config.headers.Authorization = `Bearer ${getToken()}`;
  return config;
});

// Log every response
api.addResponseInterceptor((response) => {
  console.log(`${response.status} ${response.url} in ${response.duration}ms`);
  return response;
});
```

## Middleware

```js
api.use(async (ctx, next) => {
  console.log('Before:', ctx.config.url);
  await next();
  console.log('After:', ctx.response.status);
});
```

## Plugins

```js
const { LoggerPlugin, AuthPlugin, CachePlugin } = require('nexus-http');

api.use(LoggerPlugin);
api.use(AuthPlugin(() => localStorage.getItem('token')));
api.use(CachePlugin({ ttl: 30000 }));
```

## Metrics

```js
const report = api.getMetrics();
// { total: 42, avgTime: 123, byStatus: { 200: 40, 404: 2 }, history: [...] }

api.clearMetrics();
```

## Parallel Requests

```js
const [users, posts] = await api.all([
  api.get('/users'),
  api.get('/posts'),
]);
```

## Offline Support

Requests made while offline are automatically queued and sent when the connection is restored.

## TypeScript

Full TypeScript support included:

```ts
import { create, NexusResponse } from 'nexus-http';

const api = create({ baseURL: 'https://api.example.com' });

interface User { id: number; name: string; }

const { data }: NexusResponse<User> = await api.get<User>('/users/1');
console.log(data.name); // fully typed
```

## vs Axios

| Feature              | nexus-http | axios        |
|----------------------|------------|--------------|
| Built-in caching     | ✅         | ❌           |
| Auto retry + backoff | ✅         | ❌ (plugin)  |
| Deduplication        | ✅         | ❌           |
| Rate limiting        | ✅         | ❌           |
| Offline queue        | ✅         | ❌           |
| SSE Streaming        | ✅         | ⚠️ limited  |
| Upload progress      | ✅         | ✅           |
| Middleware pipeline  | ✅         | ⚠️ basic    |
| Request metrics      | ✅         | ❌           |
| Plugin system        | ✅         | ⚠️ basic    |
| Bundle size          | ~3kb       | ~14kb        |
| Zero dependencies    | ✅         | ✅           |

## License

MIT