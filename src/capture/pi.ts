// A Raspberry Pi camera on the network, served by pi/edgeai_stream.py.
// The script answers /info (JSON), /snapshot.jpg (one frame) and /stream.mjpg (live preview),
// with CORS headers so this page can fetch frames.

export interface PiInfo {
  name: string;
  camera: string;
  width: number;
  height: number;
}

/** Turns what the person typed into a base URL: "robot.local" → "http://robot.local:8000". */
export function normalisePiUrl(input: string): string {
  let s = input.trim().replace(/\/+$/, "");
  if (!s) throw new Error("Type the Pi's address, such as robot.local:8000");
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  const url = new URL(s);
  if (!url.port && url.protocol === "http:") url.port = "8000";
  return url.origin;
}

/** True when the browser will refuse to load an http Pi from this https page (mixed content). */
export function blockedByHttps(base: string, pageProtocol = location.protocol): boolean {
  return pageProtocol === "https:" && base.startsWith("http:");
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

export async function piInfo(base: string): Promise<PiInfo> {
  if (blockedByHttps(base))
    throw new Error("This page is on https, so the browser blocks a Pi on plain http. Open EdgeAI from http (npm run dev, or the Pi's own browser).");
  let res: Response;
  try {
    res = await fetchWithTimeout(base + "/info", 4000);
  } catch {
    throw new Error(`No answer from ${base}. Check edgeai_stream.py is running on the Pi and both are on the same network.`);
  }
  if (!res.ok) throw new Error(`The Pi answered with an error (${res.status}).`);
  return (await res.json()) as PiInfo;
}

export async function piSnapshot(base: string): Promise<Blob> {
  const res = await fetchWithTimeout(base + "/snapshot.jpg", 6000);
  if (!res.ok) throw new Error(`The Pi could not take a picture (${res.status}).`);
  return res.blob();
}

export const piStreamUrl = (base: string): string => base + "/stream.mjpg";
