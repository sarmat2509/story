/**
 * Fetch-based HTTP client to replace axios
 * Provides axios-compatible API with fetch under the hood
 */

interface RequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, any>;
  timeout?: number;
  data?: any;
  skipAuthLogoutOn401?: boolean;
}

interface RequestInterceptor {
  (config: RequestConfig): Promise<RequestConfig>;
}

interface ResponseInterceptor {
  (error: any): Promise<void>;
}

interface FetchResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
}

export class FetchClient {
  private baseURL: string;
  private timeout: number;
  private defaultHeaders: Record<string, string>;
  private requestInterceptor?: RequestInterceptor;
  private responseInterceptor?: ResponseInterceptor;

  constructor(config: { baseURL?: string; timeout?: number; headers?: Record<string, string> }) {
    this.baseURL = config.baseURL || '';
    this.timeout = config.timeout || 30000;
    this.defaultHeaders = config.headers || {};
  }

  /**
   * Configure interceptors (axios-like API)
   */
  get interceptors() {
    return {
      request: {
        use: (onFulfilled: RequestInterceptor) => {
          this.requestInterceptor = onFulfilled;
        },
      },
      response: {
        use: (
          _onFulfilled: ((response: any) => any) | undefined,
          onRejected: ResponseInterceptor
        ) => {
          this.responseInterceptor = onRejected;
        },
      },
    };
  }

  /**
   * Core request method
   */
  private async request<T>(
    method: string,
    url: string,
    config: RequestConfig = {}
  ): Promise<FetchResponse<T>> {
    // Apply request interceptor
    let finalConfig = { ...config };
    if (this.requestInterceptor) {
      finalConfig = await this.requestInterceptor(finalConfig);
    }

    // Build full URL
    const fullURL = url.startsWith('http') ? url : `${this.baseURL}${url}`;

    // Add query params
    let requestURL = fullURL;
    if (finalConfig.params) {
      const searchParams = new URLSearchParams();
      Object.entries(finalConfig.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        requestURL += (requestURL.includes('?') ? '&' : '?') + queryString;
      }
    }

    // Prepare headers
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
      ...finalConfig.headers,
    };

    // Prepare body
    let body: any;
    if (finalConfig.data) {
      if (finalConfig.data instanceof FormData) {
        // For FormData, don't set Content-Type - browser will set it with boundary
        delete headers['Content-Type'];
        body = finalConfig.data;
      } else if (typeof finalConfig.data === 'object') {
        headers['Content-Type'] = headers['Content-Type'] || 'application/json';
        body = JSON.stringify(finalConfig.data);
      } else {
        body = finalConfig.data;
      }
    }

    // Setup timeout with AbortController
    const controller = new AbortController();
    const timeoutMs = finalConfig.timeout || this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(requestURL, {
        method,
        headers,
        body,
        signal: controller.signal,
        credentials: 'include',
      });

      clearTimeout(timeoutId);

      // Parse response
      let responseData: any;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        responseData = await response.json();
      } else {
        responseData = await response.text();
      }

      // Check for HTTP errors
      if (!response.ok) {
        const error: any = new Error(`HTTP Error ${response.status}`);
        error.response = {
          status: response.status,
          statusText: response.statusText,
          data: responseData,
          headers: response.headers,
        };
        error.config = finalConfig;
        error.request = { url: requestURL, method, headers, body };

        // Apply response interceptor for errors
        if (this.responseInterceptor) {
          await this.responseInterceptor(error);
        }

        throw error;
      }

      return {
        data: responseData,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      };
    } catch (error: any) {
      clearTimeout(timeoutId);

      // Handle abort/timeout
      if (error.name === 'AbortError') {
        const timeoutError: any = new Error(`Request timeout after ${timeoutMs}ms`);
        timeoutError.code = 'ECONNABORTED';
        timeoutError.request = { url: requestURL, method, headers };
        throw timeoutError;
      }

      // Apply response interceptor for network errors
      if (this.responseInterceptor && error.response) {
        await this.responseInterceptor(error);
      }

      throw error;
    }
  }

  /**
   * GET request
   */
  async get<T = any>(url: string, config?: RequestConfig): Promise<FetchResponse<T>> {
    return this.request<T>('GET', url, config);
  }

  /**
   * POST request
   */
  async post<T = any>(url: string, data?: any, config?: RequestConfig): Promise<FetchResponse<T>> {
    return this.request<T>('POST', url, { ...config, data });
  }

  /**
   * PUT request
   */
  async put<T = any>(url: string, data?: any, config?: RequestConfig): Promise<FetchResponse<T>> {
    return this.request<T>('PUT', url, { ...config, data });
  }

  /**
   * PATCH request
   */
  async patch<T = any>(url: string, data?: any, config?: RequestConfig): Promise<FetchResponse<T>> {
    return this.request<T>('PATCH', url, { ...config, data });
  }

  /**
   * DELETE request
   */
  async delete<T = any>(url: string, config?: RequestConfig): Promise<FetchResponse<T>> {
    return this.request<T>('DELETE', url, config);
  }

  /**
   * Create a new instance with custom config
   */
  static create(config: {
    baseURL?: string;
    timeout?: number;
    headers?: Record<string, string>;
  }): FetchClient {
    return new FetchClient(config);
  }
}
