// Chamadas à API do servidor (/api). Erros viram ApiError com mensagem em português.

export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor.', 0, 'NETWORK');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const fallback = res.status >= 500 ? 'O servidor não respondeu. Ele está rodando?' : 'Erro inesperado.';
    throw new ApiError(data?.error?.message || fallback, res.status, data?.error?.code || `HTTP_${res.status}`);
  }
  return data as T;
}

export const api = {
  upload: async <T>(path: string, file: File): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(`/api${path}?name=${encodeURIComponent(file.name)}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/octet-stream' }, body: file });
    } catch { throw new ApiError('Não foi possível enviar o arquivo. Confira sua conexão.', 0, 'NETWORK'); }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(data?.error?.message || 'Não foi possível enviar o arquivo.', response.status, data?.error?.code || 'UPLOAD');
    return data as T;
  },
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado.');
