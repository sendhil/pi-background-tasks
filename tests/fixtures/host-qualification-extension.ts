import assert from 'node:assert/strict';
import { appendFileSync } from 'node:fs';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createAssistantMessageEventStream, type AssistantMessage } from '@earendil-works/pi-ai';
import { Compile } from 'typebox/compile';
import { Value } from 'typebox/value';

function record(hook: string, details: Record<string, unknown> = {}): void {
  const log = process.env['PI_BG_HOST_LOG'];
  assert.ok(log);
  appendFileSync(log, `${JSON.stringify({ hook, ...details })}\n`);
}

/** Loaded outside the development dependency ancestry by the actual host loader. */
export default function hostQualification(pi: ExtensionAPI): void {
  pi.on('before_agent_start', (_event, ctx) => {
    const roots: unknown = JSON.parse(process.env['PI_BG_HOST_ROOTS'] ?? '[]');
    assert.ok(Array.isArray(roots));
    const attribution = ctx.modelRegistry.getRegisteredProviderConfig('anthropic');
    assert.equal(attribution !== undefined, process.env['PI_BG_FEATURES'] !== 'process', 'ambient compiled attribution root follows feature profile');
    const tools = pi.getAllTools();
    const samples: Record<string, unknown> = {
      bg_run: { name: 'local test', command: 'printf local', isAgent: false },
      bg_status: {}, bg_logs: { taskId: 'local' }, bg_kill: { taskId: 'local' },
    };
    if (process.env['PI_BG_FEATURES'] !== 'process') {
      samples['bg_delegate'] = { name: 'local', prompt: 'inspect' };
      samples['fusion_reason'] = { prompt: 'local' };
      samples['fusion_investigate'] = { objective: 'local', background: [], deliverable: 'local' };
      samples['fusion_research'] = { objective: 'local', background: [], deliverable: 'local', sources: [{ url: 'https://example.com', purpose: 'local' }] };
      samples['fusion_validate'] = { objective: 'local', background: [], changeSummary: 'local', scope: ['local'], acceptanceCriteria: ['local'], verification: { status: 'not_run' } };
    } else {
      assert.equal(tools.some(tool => tool.name === 'bg_delegate' || tool.name === 'fusion_reason'), false);
    }
    for (const [name, sample] of Object.entries(samples)) {
      const tool = tools.find(tool => tool.name === name);
      assert.ok(tool, `missing compiled public tool ${name}`);
      assert.ok(roots.includes(tool.sourceInfo.path), `${name} must originate from a manifest compiled root: ${tool.sourceInfo.path}`);
      const compiled = Compile(tool.parameters);
      assert.equal(compiled.Check(sample), true, `${name} accepts valid input`);
      assert.equal(Value.Check(tool.parameters, sample), true);
      assert.equal(compiled.Check({ taskId: 3, name: 3, prompt: 3 }), false, `${name} rejects invalid input`);
    }
    record('schemas', { names: Object.keys(samples) });
  });
  pi.on('before_provider_request', () => {
    record('before_provider_request');
    return { qualified: true };
  });
  pi.on('agent_settled', () => { record('agent_settled'); });
  pi.registerProvider('pi-bg-host-qualification', {
    baseUrl: 'http://127.0.0.1:0', apiKey: 'local-only', api: 'pi-bg-host-qualification',
    models: [{ id: 'local-model', name: 'Local qualification only', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 200_000, maxTokens: 100 }],
    streamSimple(_model, _context, options) {
      const stream = createAssistantMessageEventStream();
      void (async () => {
        try {
          record('provider_call');
          assert.ok(options?.onPayload, 'host must supply final request interception');
          const payload: unknown = await options.onPayload({ qualified: false }, _model);
          assert.deepEqual(payload, { qualified: true });
          record('payload_replacement');
          const message: AssistantMessage = {
            role: 'assistant', content: [{ type: 'text', text: 'local qualification complete' }],
            api: 'pi-bg-host-qualification', provider: 'pi-bg-host-qualification', model: 'local-model',
            usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: 'stop', timestamp: Date.now(),
          };
          stream.push({ type: 'done', reason: 'stop', message });
          stream.end(message);
        } catch (error) {
          // The harness fails on exit and missing evidence; do not leave a hanging stream.
          console.error(error);
          process.exit(1);
        }
      })();
      return stream;
    },
  });
}
