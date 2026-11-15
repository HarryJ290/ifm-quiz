import { useEffect, useState } from 'react';

const BASE = import.meta.env.VITE_API_URL || 'https://ifm-quiz.onrender.com';

// Every request has a 15s timeout, so a screen can never hang forever (rule 4).
export async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(BASE + path, {
      method,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: r.status });
    return data;
  } catch (e) {
    if (e.status) throw e;
    throw Object.assign(new Error('Cannot reach the server. Check your connection and retry.'), { status: 0 });
  } finally {
    clearTimeout(timer);
  }
}

// Polls the server every second. Keeps the last good data if a request fails.
export function usePoll(path, headers, ms = 1000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let stop = false, timer;
    const run = async () => {
      try {
        const d = await api(path, { headers });
        if (!stop) { setData({ ...d, _at: Date.now() }); setError(null); }
      } catch (e) {
        if (!stop) setError(e);
      }
      if (!stop) timer = setTimeout(run, ms);
    };
    run();
    return () => { stop = true; clearTimeout(timer); };
  }, [path, tick]);
  return { data, error, retry: () => setTick((t) => t + 1) };
}
