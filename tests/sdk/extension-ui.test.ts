import { describe, it, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createAgentSession,
  createEventBus,
  DefaultResourceLoader,
  initTheme,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type EventBus,
  type ExtensionUIContext,
} from '@earendil-works/pi-coding-agent';

// UI setters are the contract: unchanged idle publication can trigger host redraws.
// Load the actual source entrypoint; existing host/packed gates cover compiled dist.
async function harness(t: TestContext) {
  const root = await mkdtemp(join(tmpdir(), 'pi-bg-extension-ui-'));
  const cwd = join(root, 'project');
  const agentDir = join(root, 'agent');
  await mkdir(cwd);
  await mkdir(agentDir);
  const savedFeatures = process.env['PI_BG_FEATURES'];
  const savedAgentDir = process.env['PI_CODING_AGENT_DIR'];
  process.env['PI_BG_FEATURES'] = 'process';
  process.env['PI_CODING_AGENT_DIR'] = agentDir;
  const events = createEventBus();
  const settingsManager = SettingsManager.inMemory();
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    eventBus: events,
    additionalExtensionPaths: [resolve('extensions/background-tasks.ts')],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noContextFiles: true,
    noThemes: true,
  });
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: null,
  });
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    resourceLoader: loader,
    settingsManager,
    modelRuntime,
    sessionManager: SessionManager.inMemory(cwd),
    noTools: 'builtin',
  });
  const runner = session.extensionRunner;
  const errors: unknown[] = [];
  await session.bindExtensions({ onError: (error) => errors.push(error) });
  initTheme('dark', false);

  // Real handles, controlled callbacks: only the interval/time boundary is replaced.
  const realSetInterval = globalThis.setInterval;
  const realClearInterval = globalThis.clearInterval;
  const intervals = new Map<ReturnType<typeof setInterval>, () => void>();
  t.mock.method(globalThis, 'setInterval', (callback: () => void, delay: number) => {
    const handle = realSetInterval(() => undefined, delay);
    intervals.set(handle, callback);
    return handle;
  });
  t.mock.method(globalThis, 'clearInterval', (handle: ReturnType<typeof setInterval>) => {
    intervals.delete(handle);
    realClearInterval(handle);
  });
  t.after(async () => {
    await runner.emit({ type: 'session_shutdown', reason: 'quit' });
    session.dispose();
    for (const handle of intervals.keys()) realClearInterval(handle);
    if (savedFeatures === undefined) Reflect.deleteProperty(process.env, 'PI_BG_FEATURES');
    else process.env['PI_BG_FEATURES'] = savedFeatures;
    if (savedAgentDir === undefined) Reflect.deleteProperty(process.env, 'PI_CODING_AGENT_DIR');
    else process.env['PI_CODING_AGENT_DIR'] = savedAgentDir;
    // Match the SDK harness: queued notification metadata writes drain after stop.
    await new Promise((resolveDrain) => setTimeout(resolveDrain, 50));
    await rm(root, { recursive: true, force: true });
  });

  function countedUi(destination = { statuses: [] as Array<string | undefined>, widgets: 0 }) {
    let palette = '';
    let failWidget = false;
    let failStatus = false;
    let widgetAttempts = 0;
    let statusAttempts = 0;
    const base = runner.getUIContext();
    let currentTheme = new Proxy(base.theme, {
      get(target, key, receiver) {
        if (key === 'fg') return (_role: string, text: string) => `${palette}${text}`;
        return Reflect.get(target, key, receiver);
      },
    });
    const ui: ExtensionUIContext = {
      ...base,
      get theme() { return currentTheme; },
      notify: () => undefined,
      setWidget(key, content) {
        assert.equal(key, 'background-tasks');
        assert.equal(content, undefined);
        widgetAttempts++;
        if (failWidget) throw new Error('injected widget failure');
        destination.widgets++;
      },
      setStatus(key, text) {
        assert.equal(key, 'background-tasks');
        statusAttempts++;
        if (failStatus) throw new Error('injected status failure');
        destination.statuses.push(text);
      },
    };
    return {
      ui,
      destination,
      get widgetAttempts() { return widgetAttempts; },
      get statusAttempts() { return statusAttempts; },
      setPalette(value: string) { palette = value; },
      setTheme(value: ExtensionUIContext['theme']) { currentTheme = value; },
      failWidget(value: boolean) { failWidget = value; },
      failStatus(value: boolean) { failStatus = value; },
    };
  }
  const counted = countedUi();
  runner.setUIContext(counted.ui);
  const start = () => runner.emit({ type: 'session_start', reason: 'startup' });
  const tick = () => { for (const callback of [...intervals.values()]) callback(); };
  const clear = async () => {
    const command = runner.getRegisteredCommands().find((entry) => entry.invocationName === 'bg-clear');
    assert.ok(command);
    await command.handler('', runner.createCommandContext());
  };
  const terminals = new Map<string, Record<string, unknown>>();
  events.on('pi-background-tasks:terminal:v1', (frame) => {
    const task = record(record(frame)['task']);
    terminals.set(String(task['id']), task);
  });
  const run = async (command: string) => {
    const task = await request(events, 'v1', 'run', {
      name: 'UI fixture', command, isAgent: false,
      notifyOnCompletion: false, triggerOnCompletion: false,
    });
    assert.equal(task['status'], 'running');
    return String(task['id']);
  };
  const terminal = async (id: string) => {
    const deadline = Date.now() + 5000;
    while (!terminals.has(id)) {
      assert.ok(Date.now() < deadline, `terminal ${id} must settle`);
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    return terminals.get(id);
  };
  return { session, runner, events, errors, intervals, counted, countedUi, start, tick, clear, run, terminal };
}

function record(value: unknown): Record<string, unknown> {
  assert.ok(typeof value === 'object' && value !== null && !Array.isArray(value));
  return value as Record<string, unknown>;
}

let requestSequence = 0;
function request(events: EventBus, lane: 'host' | 'v1', operation: string, payload: Record<string, unknown>) {
  const prefix = lane === 'host' ? 'pi-background-tasks:host' : 'pi-background-tasks';
  const schema = lane === 'host' ? 'pi-background-tasks.host-request.v1' : 'pi-background-tasks.extension-request.v1';
  const requestId = `ui-${++requestSequence}`;
  return new Promise<Record<string, unknown>>((resolveResult, reject) => {
    const timeout = setTimeout(() => { off(); reject(new Error(`timeout ${requestId}`)); }, 8000);
    const off = events.on(`${prefix}:response:v1`, (value) => {
      const frame = record(value);
      if (frame['request_id'] !== requestId) return;
      clearTimeout(timeout);
      off();
      if (frame['ok'] !== true) reject(new Error(JSON.stringify(frame)));
      else resolveResult(record(frame['result']));
    });
    events.emit(`${prefix}:request:v1`, { schema_version: schema, request_id: requestId, operation, payload });
  });
}

const runningCommand = `node -e ${JSON.stringify('setTimeout(() => {}, 10000)')}`;

void describe('extension UI publication', { concurrency: false }, () => {
  void it('synchronizes an empty footer once and skips setters on idle ticks', async (t) => {
    const h = await harness(t);
    await h.start();
    assert.deepEqual(h.counted.destination, { statuses: [undefined], widgets: 1 });
    assert.equal(h.intervals.size, 1);
    h.counted.setPalette('unused:');
    for (let i = 0; i < 5; i++) h.tick();
    assert.deepEqual(h.counted.destination, { statuses: [undefined], widgets: 1 },
      'unchanged idle ticks must not invoke either UI setter');
    assert.deepEqual(h.errors, []);
  });

  void it('skips equal callbacks with fresh contexts sharing the same UI', async (t) => {
    const h = await harness(t);
    await h.start();
    const id = await h.run(runningCommand);
    assert.deepEqual(h.counted.destination.statuses, [undefined, 'bg 1 running']);
    for (let i = 0; i < 3; i++) {
      await h.clear();
      await h.start();
      h.tick();
    }
    assert.deepEqual(h.counted.destination, { statuses: [undefined, 'bg 1 running'], widgets: 1 });
    await request(h.events, 'v1', 'kill', { taskId: id });
    await h.terminal(id);
    assert.equal(h.counted.destination.statuses.at(-1), undefined);
  });

  void it('does not repaint equal footer bytes on registry telemetry changes', async (t) => {
    const h = await harness(t);
    await h.start();
    const lease = await request(h.events, 'host', 'subscribe', { clientId: 'telemetry-ui-test' });
    const id = await h.run(`node -e ${JSON.stringify(
      'console.log(JSON.stringify({type:"background-task-telemetry",model:"test-provider/test-model",contextUsage:{tokens:50000,contextWindow:200000,percent:25}})); setTimeout(() => {}, 10000)',
    )}`);
    let sequence = 0;
    const deadline = Date.now() + 5000;
    for (;;) {
      const detail = await request(h.events, 'host', 'detail', {
        leaseId: lease['leaseId'], activationId: lease['activationId'], sequence: ++sequence, taskId: id,
      });
      const task = record(record(detail['task'])['task']);
      if (task['model'] === 'test-provider/test-model') break;
      assert.ok(Date.now() < deadline, 'real registry telemetry must arrive');
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
    assert.deepEqual(h.counted.destination, { statuses: [undefined, 'bg 1 running'], widgets: 1 });
    const list = await request(h.events, 'host', 'list', {
      leaseId: lease['leaseId'], activationId: lease['activationId'], sequence: ++sequence,
    });
    assert.ok(Number(list['revision']) > Number(lease['revision']) + 1, 'registry telemetry invalidates independently of admission and footer bytes');
  });

  void it('publishes running, failure and acknowledgement changes without waiting for ticks', async (t) => {
    const h = await harness(t);
    await h.start();
    const running = await h.run(runningCommand);
    const failed = await h.run('node -e "process.exit(2)"');
    assert.equal((await h.terminal(failed))?.['status'], 'failed');
    assert.deepEqual(h.counted.destination.statuses,
      [undefined, 'bg 1 running', 'bg 2 running', 'bg 1 running · 1 failed']);
    await h.clear();
    assert.equal(h.counted.destination.statuses.at(-1), 'bg 1 running');
    await h.clear();
    assert.equal(h.counted.destination.statuses.length, 5);
    await request(h.events, 'v1', 'kill', { taskId: running });
    assert.equal((await h.terminal(running))?.['status'], 'killed');
    assert.equal(h.counted.destination.statuses.at(-1), undefined);
    assert.equal(h.counted.destination.widgets, 1);
  });

  void it('compares themed bytes on ticks including theme replacement on a stable UI', async (t) => {
    const h = await harness(t);
    await h.start();
    await h.run(runningCommand);
    h.counted.setPalette('\x1b[31m');
    h.tick();
    h.tick();
    assert.deepEqual(h.counted.destination.statuses,
      [undefined, 'bg 1 running', '\x1b[31mbg \x1b[31m1 running']);
    h.counted.setTheme(new Proxy(h.counted.ui.theme, {
      get(target, key, receiver) {
        if (key === 'fg') return (_role: string, text: string) => text;
        return Reflect.get(target, key, receiver);
      },
    }));
    h.tick();
    h.tick();
    assert.equal(h.counted.destination.statuses.at(-1), 'bg 1 running');
    assert.equal(h.counted.destination.statuses.length, 4);
    assert.equal(h.counted.destination.widgets, 1);
  });

  void it('resynchronizes on new UI and aliased A→B→A reference transitions', async (t) => {
    const h = await harness(t);
    await h.start();
    await h.run(runningCommand);
    const b = h.countedUi(h.counted.destination);
    b.setPalette('B:');
    h.runner.setUIContext(b.ui);
    await h.clear();
    assert.equal(b.destination.statuses.at(-1), 'B:bg B:1 running');
    h.runner.setUIContext(h.counted.ui);
    await h.clear();
    assert.deepEqual(h.counted.destination,
      { statuses: [undefined, 'bg 1 running', 'B:bg B:1 running', 'bg 1 running'], widgets: 3 });
    const fresh = h.countedUi();
    h.runner.setUIContext(fresh.ui);
    await h.start();
    h.tick();
    assert.deepEqual(fresh.destination, { statuses: ['bg 1 running'], widgets: 1 });
  });

  void it('synchronizes when a headless context becomes interactive', async (t) => {
    const h = await harness(t);
    const ui = h.counted.ui;
    h.runner.setUIContext(undefined);
    await h.start();
    h.tick();
    assert.deepEqual(h.counted.destination, { statuses: [], widgets: 0 });
    h.runner.setUIContext(ui);
    await h.clear();
    h.tick();
    assert.deepEqual(h.counted.destination, { statuses: [undefined], widgets: 1 });
  });

  void it('captures a getter-backed context UI once for each synchronization', async (t) => {
    const h = await harness(t);
    await h.start();
    let reads = 0;
    const context = h.runner.createContext();
    Object.defineProperty(context, 'ui', { get() { reads++; return h.counted.ui; } });
    const shortcut = h.runner.getShortcuts({}).get('ctrl+alt+c');
    assert.ok(shortcut);
    await shortcut.handler(context);
    // The notification path also reads ui once; footer synchronization gets one read.
    assert.equal(reads, 2);
    assert.deepEqual(h.counted.destination, { statuses: [undefined], widgets: 1 });
  });

  void it('retries failed status writes without repeating a successful widget clear', async (t) => {
    const h = await harness(t);
    const warnings = t.mock.method(console, 'error', () => undefined);
    h.counted.failStatus(true);
    await h.start();
    assert.equal(h.counted.widgetAttempts, 1);
    assert.equal(h.counted.statusAttempts, 1);
    h.tick();
    assert.equal(h.counted.statusAttempts, 1, 'failure clears currentCtx until restoration');
    await h.clear();
    assert.equal(h.counted.statusAttempts, 2);
    assert.equal(h.counted.widgetAttempts, 1);
    h.counted.failStatus(false);
    await h.clear();
    h.tick();
    assert.deepEqual(h.counted.destination, { statuses: [undefined], widgets: 1 });
    assert.equal(h.counted.statusAttempts, 3);
    assert.equal(warnings.mock.callCount(), 2);
  });

  void it('retries failed widget clears before attempting the initial status', async (t) => {
    const h = await harness(t);
    const warnings = t.mock.method(console, 'error', () => undefined);
    h.counted.failWidget(true);
    await h.start();
    h.tick();
    assert.equal(h.counted.widgetAttempts, 1);
    assert.equal(h.counted.statusAttempts, 0);
    h.counted.failWidget(false);
    await h.clear();
    h.tick();
    assert.equal(h.counted.widgetAttempts, 2);
    assert.equal(h.counted.statusAttempts, 1);
    assert.deepEqual(h.counted.destination, { statuses: [undefined], widgets: 1 });
    assert.equal(warnings.mock.callCount(), 1);
  });

  void it('keeps failed changed-byte status publication retryable after context restoration', async (t) => {
    const h = await harness(t);
    t.mock.method(console, 'error', () => undefined);
    await h.start();
    await h.run(runningCommand);
    h.counted.setPalette('new:');
    h.counted.failStatus(true);
    h.tick();
    assert.equal(h.counted.destination.statuses.at(-1), 'bg 1 running');
    h.counted.failStatus(false);
    await h.clear();
    h.tick();
    assert.equal(h.counted.destination.statuses.at(-1), 'new:bg new:1 running');
    assert.equal(h.counted.statusAttempts, 4);
    assert.equal(h.counted.widgetAttempts, 1);
  });

  void it('preserves independent host revisions when acknowledging hidden successful tasks', async (t) => {
    const h = await harness(t);
    await h.start();
    const completed = await h.run('node -e "process.exit(0)"');
    await h.terminal(completed);
    await h.run(runningCommand);
    const lease = await request(h.events, 'host', 'subscribe', { clientId: 'ui-test' });
    const before = [...h.counted.destination.statuses];
    const changed: Record<string, unknown>[] = [];
    h.events.on('pi-background-tasks:host:changed:v1', (value) => changed.push(record(value)));
    const result = await request(h.events, 'host', 'mark_seen', {
      leaseId: lease['leaseId'], activationId: lease['activationId'], sequence: 1, taskIds: [completed],
    });
    assert.ok(Number(result['revision']) > Number(lease['revision']));
    assert.deepEqual(result['results'], [{ taskId: completed, outcome: 'marked' }]);
    assert.deepEqual(h.counted.destination.statuses, before);
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    assert.ok(changed.some((frame) => frame['kind'] === 'changed' && frame['revision'] === result['revision']));
  });

  void it('synchronously fences stale tick callbacks and late session starts after shutdown', async (t) => {
    const h = await harness(t);
    await h.start();
    await h.run(runningCommand);
    const lateTick = [...h.intervals.values()][0];
    assert.ok(lateTick);
    const before = { statuses: [...h.counted.destination.statuses], widgets: h.counted.destination.widgets };
    const shutdown = h.runner.emit({ type: 'session_shutdown', reason: 'quit' });
    assert.equal(h.intervals.size, 0, 'early close fence clears the timer synchronously');
    lateTick();
    await h.start();
    await shutdown;
    await h.runner.emit({ type: 'session_shutdown', reason: 'quit' });
    assert.equal(h.intervals.size, 0);
    assert.deepEqual(h.counted.destination, before);
  });
});
