import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { footerStatusSegments } from '../../src/ui/footer-status.js';
import type { BgTaskSnapshot } from '../../src/core/common.js';

type FooterTask = Pick<BgTaskSnapshot, 'id' | 'status'>;
const task = (id: string, status: FooterTask['status']): FooterTask => ({ id, status });

void describe('footer-status attention policy', () => {
  for (const [name, tasks, seen, expected] of [
    ['empty', [], [], ''],
    ['running', [task('a', 'running'), task('b', 'running')], ['a'], 'bg 2 running'],
    ['unseen failed', [task('a', 'failed')], [], 'bg 1 failed'],
    ['seen failed', [task('a', 'failed')], ['a'], ''],
    ['completed', [task('a', 'completed')], [], ''],
    ['killed', [task('a', 'killed')], [], ''],
    [
      'mixed',
      [
        task('a', 'running'), task('b', 'failed'), task('c', 'completed'),
        task('d', 'killed'), task('e', 'failed'),
      ],
      ['e'],
      'bg 1 running · 1 failed',
    ],
  ] as const) {
    void it(name, () => {
      const seenIds = new Set<string>(seen);
      const beforeTasks = structuredClone(tasks);
      const segments = footerStatusSegments(tasks, seenIds);
      const text = segments.map((segment) => segment.text).join('');
      assert.equal(text, expected);
      assert.deepEqual([...seenIds], seen);
      assert.deepEqual(tasks, beforeTasks);
      assert.doesNotMatch(text, /done|stopped|focused|Shift|bg-clear|bg-update|⬆/);
    });
  }

  void it('assigns subdued chrome and running text, error only to failures', () => {
    assert.deepEqual(footerStatusSegments([task('a', 'running'), task('b', 'failed')], new Set()), [
      { role: 'dim', text: 'bg ' },
      { role: 'dim', text: '1 running' },
      { role: 'dim', text: ' · ' },
      { role: 'error', text: '1 failed' },
    ]);
  });
});
