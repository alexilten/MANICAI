/**
 * Round 08: a project inside a link. The project JSON is deflated and written base64url after
 * `#project=`, so the design travels in the URL fragment: it is never sent to a server, and the
 * link works on any Manica deployment that can read the schema version.
 */
import { readProject, type Project } from './schema';

export const SHARE_KEY = 'project';

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}
const toB64url = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (t: string) => {
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

/** the fragment for a project, without the leading `#` */
export async function encodeShare(p: Project): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(p));
  return `${SHARE_KEY}=${toB64url(await pipe(json, new CompressionStream('deflate-raw')))}`;
}

/** read a project from a URL fragment; null when the fragment holds none */
export async function decodeShare(hash: string): Promise<{ project: Project; repaired: string[] } | null> {
  const m = new RegExp(`(?:^|[#&])${SHARE_KEY}=([A-Za-z0-9_-]+)`).exec(hash);
  if (!m) return null;
  let text: string;
  try { text = new TextDecoder().decode(await pipe(fromB64url(m[1]), new DecompressionStream('deflate-raw'))); } catch { throw new Error('This share link is incomplete or damaged'); }
  return readProject(text);
}
