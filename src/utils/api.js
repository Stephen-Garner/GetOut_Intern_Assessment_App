let BASE = '/api';
let baseResolved = false;

async function resolveBase() {
  if (baseResolved) return;
  if (window.beacon?.isElectron) {
    const serverUrl = await window.beacon.getServerUrl();
    BASE = `${serverUrl}/api`;
  }
  baseResolved = true;
}

async function request(path, options = {}) {
  await resolveBase();
  const url = `${BASE}${path}`;
  const config = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  const res = await fetch(url, config);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: 'POST', body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (path) => request(path, { method: 'DELETE' }),
};
