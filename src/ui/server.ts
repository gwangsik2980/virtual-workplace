/**
 * 가온식품 서버(worker/) 주소. 기기 연결과 닫아 둔 동안 알림이 함께 쓴다.
 * 비어 있으면 두 기능을 숨긴다. 로컬 확인은 `VITE_SERVER=http://localhost:8787 npm run build`.
 */
export const SERVER: string = (import.meta.env.VITE_SERVER as string | undefined) || '';

export async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const r = await fetch(SERVER + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return (await r.json()) as T;
}

export async function getJson<T = unknown>(path: string): Promise<T> {
  const r = await fetch(SERVER + path, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return (await r.json()) as T;
}
