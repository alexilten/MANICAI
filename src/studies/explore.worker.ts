/// <reference lib="webworker" />
/** Runs the design exploration off the main thread and reports progress. */
import { explore } from './explore';
import type { Project } from '../core/schema';

self.onmessage = (ev: MessageEvent<{ project: Project; seed?: number }>) => {
  try {
    const result = explore(ev.data.project, { seed: ev.data.seed, onProgress: (done, total) => self.postMessage({ type: 'progress', done, total }) });
    self.postMessage({ type: 'done', result });
  } catch (e) {
    self.postMessage({ type: 'error', message: String((e as Error)?.message ?? e) });
  }
};
