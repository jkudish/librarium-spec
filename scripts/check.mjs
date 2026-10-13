// Validates the schemas against the fixtures and checks every selection
// fixture against a small reference implementation of SPEC.md sections 3–4.
// Test-only code: it is not published and is not a runtime for either package.
import { readFileSync, readdirSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const json = (path) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));
const list = (dir) => readdirSync(new URL(`../${dir}`, import.meta.url)).filter((f) => f.endsWith('.json')).sort();
let failures = 0;
const fail = (msg) => { failures++; console.error(`✗ ${msg}`); };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const name of ['run', 'request', 'stored-run']) ajv.addSchema(json(`schema/${name}.schema.json`), `${name}.schema.json`);
const validate = (schema, doc) => ajv.validate(schema, doc);

for (const f of list('fixtures/runs/valid')) if (!validate('run.schema.json', json(`fixtures/runs/valid/${f}`))) fail(`runs/valid/${f}: ${ajv.errorsText()}`);
for (const f of list('fixtures/runs/invalid')) if (validate('run.schema.json', json(`fixtures/runs/invalid/${f}`))) fail(`runs/invalid/${f} unexpectedly validates`);
if (!validate('stored-run.schema.json', json('fixtures/run-store/stored-run.json'))) fail(`run-store/stored-run.json: ${ajv.errorsText()}`);

const catalog = json('sources.json');
const sources = catalog.sources;
const engines = catalog.engines;
const ids = [...sources, ...engines].map((s) => s.id);
if (new Set(ids).size !== ids.length) fail('sources.json: duplicate source or engine id');
const order = new Map(ids.map((id, i) => [id, i]));

const toMicros = (s) => { const [w, f = ''] = s.split('.'); return BigInt(w) * 1_000_000n + BigInt((f + '000000').slice(0, 6)); };
const fromMicros = (n) => { const w = n / 1_000_000n; const f = (n % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, ''); return f ? `${w}.${f}` : `${w}`; };

function select(setup, estimates, request) {
  for (const g of Object.keys(setup.groups)) if (order.has(g)) return { error: 'group_name_conflict', name: g };
  const depth = request.depth ?? 'quick';
  const isEngine = (id) => engines.some((e) => e.id === id);
  let names;
  if (request.only) {
    names = [];
    for (const n of request.only) {
      if (setup.groups[n]) names.push(...setup.groups[n]);
      else if (order.has(n)) names.push(n);
      else return { error: 'unknown_name', name: n };
    }
    for (const n of names) {
      if (isEngine(n) ? !setup.engines.configured : !setup.sources.includes(n)) return { error: 'not_configured', name: n };
    }
  } else {
    names = setup.sources.filter((s) => !isEngine(s));
    if (names.length === 0) return { error: 'no_sources' };
  }
  names = [...new Set(names)].sort((a, b) => order.get(a) - order.get(b));
  const selected = [];
  const skipped = [];
  for (const n of names) {
    if (request.skip?.includes(n)) { skipped.push({ source: n, reason: 'excluded' }); continue; }
    if (isEngine(n)) {
      if (depth === 'deep') { skipped.push({ source: n, reason: 'no_deep_variant' }); continue; }
      const engine = engines.find((e) => e.id === n);
      if (!engine.collectors[setup.engines.collector]) { skipped.push({ source: n, reason: 'no_collector' }); continue; }
    } else if (!sources.find((s) => s.id === n).variants[depth]) { skipped.push({ source: n, reason: 'no_deep_variant' }); continue; }
    selected.push(n);
  }
  const out = { selected: [], skipped };
  let total = 0n;
  let complete = true;
  const cap = request.max_cost === undefined ? null : toMicros(request.max_cost);
  for (const n of selected) {
    const est = estimates[n];
    if (cap !== null && (est === null || est === undefined)) { skipped.push({ source: n, reason: 'unpriced' }); continue; }
    if (est === null || est === undefined) { complete = false; out.selected.push(n); continue; }
    if (cap !== null && total + toMicros(est) > cap) { skipped.push({ source: n, reason: 'over_budget' }); continue; }
    total += toMicros(est);
    out.selected.push(n);
  }
  skipped.sort((a, b) => order.get(a.source) - order.get(b.source));
  if (Object.keys(estimates).length > 0) out.estimated = complete ? fromMicros(total) : null;
  return out;
}

for (const f of list('fixtures/selection')) {
  const c = json(`fixtures/selection/${f}`);
  if (!validate('request.schema.json', c.request)) fail(`selection/${f}: request invalid: ${ajv.errorsText()}`);
  const got = select(c.setup, c.estimates, c.request);
  if (JSON.stringify(got) !== JSON.stringify(c.expected)) fail(`selection/${f}: expected ${JSON.stringify(c.expected)}, reference gave ${JSON.stringify(got)}`);
}

const steps = json('fixtures/run-store/contract.json').steps;
if (!Array.isArray(steps) || steps.length === 0) fail('run-store/contract.json has no steps');

if (failures) { console.error(`${failures} failure(s)`); process.exit(1); }
console.log(`ok: ${list('fixtures/runs/valid').length} valid and ${list('fixtures/runs/invalid').length} invalid Runs, ${list('fixtures/selection').length} selection cases, ${sources.length} sources, ${engines.length} engines`);

{
  const stored = json('fixtures/run-store/stored-run.json');
  const dir = `fixtures/run-store/filesystem/${stored.run.id}`;
  const folder = {
    run: json(`${dir}/run.json`),
    ...(({ version, state }) => ({ version, state }))(json(`${dir}/state.json`)),
    files: Object.fromEntries(Object.keys(stored.files).map((k) => [k, readFileSync(new URL(`../${dir}/${k}`, import.meta.url), 'utf8')])),
  };
  const canon = (o) => JSON.stringify(o, Object.keys(o).sort());
  if (JSON.stringify({ ...folder, files: folder.files }) === '' || JSON.stringify(folder.run) !== JSON.stringify(stored.run) || folder.version !== stored.version || JSON.stringify(folder.state) !== JSON.stringify(stored.state) || JSON.stringify(folder.files) !== JSON.stringify(stored.files)) {
    console.error('✗ run-store/filesystem example does not match stored-run.json'); process.exit(1);
  }
  console.log('ok: filesystem layout example matches stored-run.json');
}
