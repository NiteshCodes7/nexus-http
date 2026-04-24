'use strict';

// ─────────────────────────────────────────────
//  NexusHTTP — A better HTTP client than axios
// ─────────────────────────────────────────────

class NexusError extends Error {
  constructor(message, response, config) {
    super(message);
    this.name = 'NexusError';
    this.response = response || null;
    this.config = config || null;
    this.status = response?.status || null;
  }
}

class NexusHTTP {
  constructor(config = {}) {
    this.baseURL       = config.baseURL || '';
    this.timeout       = config.timeout || 10000;
    this.headers       = config.headers || { 'Content-Type': 'application/json' };
    this.maxRetries    = config.maxRetries ?? 3;
    this.maxConcurrent = config.maxConcurrent ?? 10;
    this.cacheEnabled  = config.cache ?? false;
    this.cacheTTL      = config.cacheTTL ?? 60000; // 1 minute

    // Internals
    this._requestInterceptors  = [];
    this._responseInterceptors = [];
    this._middlewares          = [];
    this._plugins              = [];
    this._cache                = new Map();   // key → { data, expiresAt }
    this._inFlight             = new Map();   // key → Promise (dedup)
    this._queue                = [];
    this._activeRequests       = 0;
    this._offlineQueue         = [];
    this._metrics              = [];

    // Offline support
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this._flushOfflineQueue());
    }
  }

  // ─── Interceptors ────────────────────────────

  addRequestInterceptor(fn)  { this._requestInterceptors.push(fn);  return this; }
  addResponseInterceptor(fn) { this._responseInterceptors.push(fn); return this; }

  // ─── Middleware (express-style) ───────────────

  use(fn) {
    if (typeof fn === 'function') {
      this._middlewares.push(fn);
    } else if (fn && typeof fn.install === 'function') {
      fn.install(this);             // plugin pattern
      this._plugins.push(fn);
    }
    return this;
  }

  // ─── Core request ────────────────────────────

  async request(config) {
    // Apply request interceptors
    let finalConfig = {
      method: 'GET',
      headers: {},
      retries: this.maxRetries,
      cache: this.cacheEnabled,
      cacheTTL: this.cacheTTL,
      dedupe: true,
      ...config,
    };

    for (const interceptor of this._requestInterceptors) {
      finalConfig = (await interceptor(finalConfig)) || finalConfig;
    }

    // Run middleware pipeline
    if (this._middlewares.length > 0) {
      const ctx = { config: finalConfig, response: null };
      await this._runMiddleware(ctx, 0, () => this._execute(finalConfig));
      return ctx.response;
    }

    return this._execute(finalConfig);
  }

  async _runMiddleware(ctx, index, coreHandler) {
    if (index >= this._middlewares.length) {
      ctx.response = await coreHandler();
      return;
    }
    const fn = this._middlewares[index];
    await fn(ctx, () => this._runMiddleware(ctx, index + 1, coreHandler));
  }

  async _execute(config) {
    const { method, url, data, params, cache, cacheTTL, dedupe, retries } = config;

    // Build URL
    let fullURL = this.baseURL + (url || '');
    if (params && Object.keys(params).length) {
      fullURL += '?' + new URLSearchParams(params).toString();
    }

    const cacheKey = `${method}:${fullURL}:${JSON.stringify(data || '')}`;

    // ── Cache check ──
    if (cache && method === 'GET') {
      const cached = this._cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return { ...cached.data, fromCache: true };
      }
    }

    // ── Deduplication ──
    if (dedupe && this._inFlight.has(cacheKey)) {
      return this._inFlight.get(cacheKey);
    }

    // ── Offline check ──
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return new Promise((resolve) => {
        this._offlineQueue.push({ config, resolve });
      });
    }

    // ── Concurrency queue ──
    if (this._activeRequests >= this.maxConcurrent) {
      await new Promise((r) => this._queue.push(r));
    }

    this._activeRequests++;

    const promise = this._fetchWithRetry(fullURL, config, retries, cacheKey, cacheTTL)
      .finally(() => {
        this._activeRequests--;
        this._inFlight.delete(cacheKey);
        if (this._queue.length > 0) this._queue.shift()();
      });

    if (dedupe) this._inFlight.set(cacheKey, promise);

    return promise;
  }

  async _fetchWithRetry(fullURL, config, retriesLeft, cacheKey, cacheTTL) {
    const { method, data, headers, retryOn = [429, 503] } = config;

    const mergedHeaders = { ...this.headers, ...headers };

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), this.timeout);

    const start = Date.now();

    try {
      const res = await fetch(fullURL, {
        method,
        headers: mergedHeaders,
        body: data != null ? JSON.stringify(data) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const duration = Date.now() - start;

      // Parse body
      const contentType = res.headers.get('content-type') || '';
      let responseData;
      if (contentType.includes('application/json')) {
        responseData = await res.json();
      } else if (contentType.includes('text/')) {
        responseData = await res.text();
      } else {
        responseData = await res.blob();
      }

      const response = {
        data: responseData,
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        duration,
        url: fullURL,
        fromCache: false,
      };

      // Track metrics
      this._metrics.push({ url: fullURL, method, status: res.status, duration });

      // Retry on specific status codes
      if (!res.ok && retryOn.includes(res.status) && retriesLeft > 0) {
        const backoff = 2 ** (this.maxRetries - retriesLeft) * 1000;
        await this._sleep(backoff);
        return this._fetchWithRetry(fullURL, config, retriesLeft - 1, cacheKey, cacheTTL);
      }

      if (!res.ok) {
        throw new NexusError(`Request failed with status ${res.status}`, response, config);
      }

      // Apply response interceptors
      let finalResponse = response;
      for (const interceptor of this._responseInterceptors) {
        finalResponse = (await interceptor(finalResponse)) || finalResponse;
      }

      // Store in cache
      if (config.cache && method === 'GET') {
        this._cache.set(cacheKey, {
          data: finalResponse,
          expiresAt: Date.now() + (cacheTTL ?? this.cacheTTL),
        });
      }

      return finalResponse;

    } catch (err) {
      clearTimeout(timeoutId);

      if (err.name === 'AbortError') {
        throw new NexusError(`Request timed out after ${this.timeout}ms`, null, config);
      }

      // Network error retry
      if (retriesLeft > 0 && !(err instanceof NexusError)) {
        const backoff = 2 ** (this.maxRetries - retriesLeft) * 1000;
        await this._sleep(backoff);
        return this._fetchWithRetry(fullURL, config, retriesLeft - 1, cacheKey, cacheTTL);
      }

      throw err;
    }
  }

  // ─── Streaming (SSE / chunked) ───────────────

  async stream(url, onChunk, config = {}) {
    const fullURL = this.baseURL + url;
    const res = await fetch(fullURL, {
      method: config.method || 'GET',
      headers: { ...this.headers, ...config.headers },
      body: config.data ? JSON.stringify(config.data) : undefined,
    });

    if (!res.ok) throw new NexusError(`Stream failed with status ${res.status}`, null, config);

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(decoder.decode(value, { stream: true }));
    }
  }

  // ─── Upload with progress ────────────────────

  upload(url, formData, onProgress, config = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(config.method || 'POST', this.baseURL + url);

      // Set headers (skip Content-Type for FormData)
      Object.entries({ ...this.headers, ...config.headers }).forEach(([k, v]) => {
        if (k.toLowerCase() !== 'content-type') xhr.setRequestHeader(k, v);
      });

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        let data;
        try { data = JSON.parse(xhr.responseText); } catch { data = xhr.responseText; }
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ data, status: xhr.status });
        } else {
          reject(new NexusError(`Upload failed with status ${xhr.status}`, { status: xhr.status, data }, config));
        }
      };

      xhr.onerror = () => reject(new NexusError('Upload network error', null, config));
      xhr.send(formData);
    });
  }

  // ─── Metrics ─────────────────────────────────

  getMetrics() {
    const total   = this._metrics.length;
    const avgTime = total
      ? Math.round(this._metrics.reduce((s, m) => s + m.duration, 0) / total)
      : 0;
    const byStatus = this._metrics.reduce((acc, m) => {
      acc[m.status] = (acc[m.status] || 0) + 1;
      return acc;
    }, {});
    return { total, avgTime, byStatus, history: [...this._metrics] };
  }

  clearMetrics() { this._metrics = []; return this; }

  // ─── Cache control ────────────────────────────

  clearCache(url) {
    if (url) {
      for (const key of this._cache.keys()) {
        if (key.includes(url)) this._cache.delete(key);
      }
    } else {
      this._cache.clear();
    }
    return this;
  }

  // ─── Offline queue flush ──────────────────────

  _flushOfflineQueue() {
    const q = [...this._offlineQueue];
    this._offlineQueue = [];
    q.forEach(({ config, resolve }) => resolve(this._execute(config)));
  }

  // ─── Helpers ──────────────────────────────────

  _sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  create(config = {}) {
    return new NexusHTTP({ ...this._baseConfig(), ...config });
  }

  _baseConfig() {
    return {
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: this.headers,
      maxRetries: this.maxRetries,
      maxConcurrent: this.maxConcurrent,
      cache: this.cacheEnabled,
      cacheTTL: this.cacheTTL,
    };
  }

  // ─── HTTP method shorthands ───────────────────

  get(url, config = {})                { return this.request({ ...config, method: 'GET',    url }); }
  post(url, data, config = {})         { return this.request({ ...config, method: 'POST',   url, data }); }
  put(url, data, config = {})          { return this.request({ ...config, method: 'PUT',    url, data }); }
  patch(url, data, config = {})        { return this.request({ ...config, method: 'PATCH',  url, data }); }
  delete(url, config = {})             { return this.request({ ...config, method: 'DELETE', url }); }
  head(url, config = {})               { return this.request({ ...config, method: 'HEAD',   url }); }
  options(url, config = {})            { return this.request({ ...config, method: 'OPTIONS',url }); }

  // ─── Parallel requests ────────────────────────

  all(requests)  { return Promise.all(requests); }
  race(requests) { return Promise.race(requests); }
}

// ─── Built-in Plugins ────────────────────────────

const LoggerPlugin = {
  install(client) {
    client.addRequestInterceptor((config) => {
      console.log(`[NexusHTTP] → ${config.method} ${config.url}`);
      return config;
    });
    client.addResponseInterceptor((response) => {
      console.log(`[NexusHTTP] ← ${response.status} ${response.url} (${response.duration}ms)`);
      return response;
    });
  },
};

const AuthPlugin = (getToken) => ({
  install(client) {
    client.addRequestInterceptor(async (config) => {
      const token = typeof getToken === 'function' ? await getToken() : getToken;
      config.headers = { ...config.headers, Authorization: `Bearer ${token}` };
      return config;
    });
  },
});

const CachePlugin = (options = {}) => ({
  install(client) {
    client.cacheEnabled = true;
    client.cacheTTL     = options.ttl ?? 60000;
  },
});

// ─── Default export ───────────────────────────────

const nexus = new NexusHTTP();

module.exports             = nexus;
module.exports.NexusHTTP   = NexusHTTP;
module.exports.NexusError  = NexusError;
module.exports.LoggerPlugin = LoggerPlugin;
module.exports.AuthPlugin  = AuthPlugin;
module.exports.CachePlugin = CachePlugin;
module.exports.create      = (config) => new NexusHTTP(config);