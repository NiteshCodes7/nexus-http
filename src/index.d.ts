// NexusHTTP — TypeScript Definitions

export interface NexusConfig {
  baseURL?: string;
  timeout?: number;
  headers?: Record<string, string>;
  maxRetries?: number;
  maxConcurrent?: number;
  cache?: boolean;
  cacheTTL?: number;
}

export interface RequestConfig extends NexusConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
  url?: string;
  data?: unknown;
  params?: Record<string, string | number | boolean>;
  retries?: number;
  retryOn?: number[];
  dedupe?: boolean;
}

export interface NexusResponse<T = unknown> {
  data: T;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  duration: number;
  url: string;
  fromCache: boolean;
}

export interface Metric {
  url: string;
  method: string;
  status: number;
  duration: number;
}

export interface MetricsReport {
  total: number;
  avgTime: number;
  byStatus: Record<number, number>;
  history: Metric[];
}

export type RequestInterceptor  = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
export type ResponseInterceptor = <T>(response: NexusResponse<T>) => NexusResponse<T> | Promise<NexusResponse<T>>;
export type MiddlewareFn        = (ctx: { config: RequestConfig; response: NexusResponse | null }, next: () => Promise<void>) => Promise<void>;

export interface Plugin {
  install(client: NexusHTTP): void;
}

export class NexusError extends Error {
  response: NexusResponse | null;
  config: RequestConfig | null;
  status: number | null;
  constructor(message: string, response?: NexusResponse | null, config?: RequestConfig | null);
}

export class NexusHTTP {
  constructor(config?: NexusConfig);

  // Configuration
  baseURL: string;
  timeout: number;
  headers: Record<string, string>;
  maxRetries: number;
  maxConcurrent: number;
  cacheEnabled: boolean;
  cacheTTL: number;

  // Interceptors
  addRequestInterceptor(fn: RequestInterceptor): this;
  addResponseInterceptor(fn: ResponseInterceptor): this;

  // Middleware & plugins
  use(fn: MiddlewareFn | Plugin): this;

  // Core
  request<T = unknown>(config: RequestConfig): Promise<NexusResponse<T>>;

  // HTTP methods
  get<T = unknown>(url: string, config?: Omit<RequestConfig, 'method' | 'url'>): Promise<NexusResponse<T>>;
  post<T = unknown>(url: string, data?: unknown, config?: Omit<RequestConfig, 'method' | 'url' | 'data'>): Promise<NexusResponse<T>>;
  put<T = unknown>(url: string, data?: unknown, config?: Omit<RequestConfig, 'method' | 'url' | 'data'>): Promise<NexusResponse<T>>;
  patch<T = unknown>(url: string, data?: unknown, config?: Omit<RequestConfig, 'method' | 'url' | 'data'>): Promise<NexusResponse<T>>;
  delete<T = unknown>(url: string, config?: Omit<RequestConfig, 'method' | 'url'>): Promise<NexusResponse<T>>;
  head<T = unknown>(url: string, config?: Omit<RequestConfig, 'method' | 'url'>): Promise<NexusResponse<T>>;
  options<T = unknown>(url: string, config?: Omit<RequestConfig, 'method' | 'url'>): Promise<NexusResponse<T>>;

  // Streaming
  stream(url: string, onChunk: (chunk: string) => void, config?: RequestConfig): Promise<void>;

  // Upload with progress
  upload<T = unknown>(
    url: string,
    formData: FormData,
    onProgress?: (percent: number) => void,
    config?: RequestConfig
  ): Promise<NexusResponse<T>>;

  // Parallel
  all<T>(requests: Promise<T>[]): Promise<T[]>;
  race<T>(requests: Promise<T>[]): Promise<T>;

  // Cache
  clearCache(url?: string): this;

  // Metrics
  getMetrics(): MetricsReport;
  clearMetrics(): this;

  // Create instance
  create(config?: NexusConfig): NexusHTTP;
}

// Plugins
export const LoggerPlugin: Plugin;
export function AuthPlugin(getToken: string | (() => string | Promise<string>)): Plugin;
export function CachePlugin(options?: { ttl?: number }): Plugin;

// Default instance
declare const nexus: NexusHTTP;
export default nexus;
export function create(config?: NexusConfig): NexusHTTP;