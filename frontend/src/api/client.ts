export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    let errorData: unknown = null;
    try {
      errorData = await response.json();
    } catch {
      // response body was not valid JSON
    }

    let message = `Request failed with status ${response.status}`;
    if (errorData && typeof errorData === 'object' && 'error' in errorData) {
      const errObj = errorData as { error?: string | { message?: string } };
      if (typeof errObj.error === 'string') {
        message = errObj.error;
      } else if (errObj.error && typeof errObj.error.message === 'string') {
        message = errObj.error.message;
      }
    }

    throw new ApiError(message, response.status, errorData);
  }

  return response.json() as Promise<T>;
}

