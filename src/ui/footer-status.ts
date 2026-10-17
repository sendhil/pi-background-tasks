import type { BgTaskSnapshot } from '../core/common.js';

export interface FooterStatusSegment {
  readonly role: 'dim' | 'error';
  readonly text: string;
}

/** Attention-only display policy; acknowledgement remains owned by the host UI. */
export function footerStatusSegments(
  tasks: readonly Pick<BgTaskSnapshot, 'id' | 'status'>[],
  seenTaskIds: ReadonlySet<string>,
): FooterStatusSegment[] {
  let running = 0;
  let failed = 0;
  for (const task of tasks) {
    if (task.status === 'running') running++;
    else if (task.status === 'failed' && !seenTaskIds.has(task.id)) failed++;
  }
  if (running === 0 && failed === 0) return [];
  const segments: FooterStatusSegment[] = [{ role: 'dim', text: 'bg ' }];
  if (running > 0) segments.push({ role: 'dim', text: `${String(running)} running` });
  if (running > 0 && failed > 0) segments.push({ role: 'dim', text: ' · ' });
  if (failed > 0) segments.push({ role: 'error', text: `${String(failed)} failed` });
  return segments;
}
