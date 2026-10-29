/**
 * Round 08: what Manica keeps in this browser. The open design is saved as you work and restored
 * on the next visit, and designs saved as "My presets" sit beside the built-in presets. Nothing
 * leaves the browser; storage can be unavailable (private windows), so every call is guarded.
 */
import { readProject, serializeProject, type Project } from '../core/schema';

const AUTOSAVE_KEY = 'manica.autosave.v1';
const PRESETS_KEY = 'manica.presets.v1';

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const APP_BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'local';
export const APP_DATE = typeof __APP_DATE__ === 'string' ? __APP_DATE__ : '';
export const APP_LABEL = `Manica ${APP_VERSION} (${APP_BUILD})`;

/** before the rename from MANICAI the same data lived under manicai.* keys: fall back to them */
const legacyKey = (key: string) => key.replace(/^manica\./, 'manicai.');
function read(key: string): string | null { try { return localStorage.getItem(key) ?? localStorage.getItem(legacyKey(key)); } catch { return null; } }
function write(key: string, v: string): boolean { try { localStorage.setItem(key, v); return true; } catch { return false; } }

/** stamp a project with the app that saved it (kept in the file, ignored when read) */
export const stamped = (p: Project): Project => ({ ...p, saved: { by: APP_LABEL, at: new Date().toISOString() } });
export const saveText = (p: Project) => serializeProject(stamped(p));

export interface Autosave { project: Project; at: string; repaired: string[] }
export function readAutosave(): Autosave | null {
  const raw = read(AUTOSAVE_KEY);
  if (!raw) return null;
  try {
    const { project, repaired } = readProject(raw);
    return { project, at: project.saved?.at ?? '', repaired };
  } catch { return null; }
}
export const writeAutosave = (p: Project) => write(AUTOSAVE_KEY, JSON.stringify(stamped(p)));

export interface UserPreset { id: string; name: string; project: Project; savedAt: string }
export function readUserPresets(): UserPreset[] {
  const raw = read(PRESETS_KEY);
  if (!raw) return [];
  try {
    return (JSON.parse(raw) as UserPreset[]).flatMap((x) => { try { return [{ ...x, project: readProject(JSON.stringify(x.project)).project }]; } catch { return []; } });
  } catch { return []; }
}
export const writeUserPresets = (xs: UserPreset[]) => write(PRESETS_KEY, JSON.stringify(xs));
