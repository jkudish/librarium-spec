# Librarium simplified surface: specification

Status: **approved** by Joey Kudish on 2026-10-12 (PlanMode epic #4954).
Package version 0.1.0: schemas, `sources.json` and fixtures are in place; workers pin a commit until 1.0 is published.
Governs: Librarium JS 2.0 (`jkudish/librarium`, npm `librarium`), Laravel AI
Librarium 1.0 (`jkudish/laravel-ai-librarium`), the Firecrawl adapter
(`jkudish/laravel-ai-librarium-firecrawl`), this package, the CLI, MCP, docs,
skills, and librarium.agentsy.build.

Neither package has released this surface. All breaking changes land before
JS 2.0 and PHP 1.0 so no further breaking release is needed.

## 1. Goal

One interface for many research providers that a person learns in a minute and
an agent uses without a manual. The public surface keeps only the decisions a
user makes:

1. **What to ask**: the question.
2. **How deep**: `quick` (seconds) or `deep` (minutes, background).
3. **Which sources**: by default every source you have set up; narrow with
   `only` / `skip`.
4. **How much to spend**: an optional `max_cost`.

Everything produces a **Run**: one stored record with an id that a caller can
wait on, come back to, and read. The same Run JSON is returned by the CLI, MCP,
the JS library and the PHP package, and is what stores persist.

The provider engine stays: adapters and drivers, pricing, redaction, durable
provider tasks, usage and cost truthfulness, deadlines, the encrypted queue
job. This spec replaces the layer people and agents touch.

## 2. Concepts

| Concept | Meaning |
| --- | --- |
| Source | A provider you can ask, such as `exa` or `openai`. One flat name, identical in JS and PHP. Depth picks its variant. |
| Engine | A source that reports what a consumer AI product showed (`chatgpt`, `google-ai-overview`, …). Runs only when named. Results carry `"observation": "surface"`. |
| Depth | `quick`: answers and search. `deep`: research reports, durable background tasks. |
| Group | Optional: a user-saved list of source names, usable anywhere source names are accepted. No built-in groups. |
| Run | One execution: id, status, per-source results with citations, cost, skipped sources with reasons. |
| RunStore | Where Runs live. Configurable; four methods (section 6). |

Removed from the public surface: profiles, built-in groups, the `custom:`
prefix, modes (`sync`/`async`/`mixed`), fallbacks and reserves, the
estimated/actual budget split, capability selectors (PHP `matching()`), the
`plan` command, the `visibility` group, `refine`, and PHP `collectSensitive()`.

## 3. Sources

A source has at most one quick and one deep variant. Today's extra profiles
become source options. With `depth: deep`, sources without a deep variant are
skipped with reason `no_deep_variant`. Engines have only a quick variant and
are skipped by `deep` the same way.

### Research sources

| Source | quick | deep | Options (replace today's extra profiles) |
| --- | --- | --- | --- |
| `brave` | Brave answers | — | `results: answer \| search` (brave-search) |
| `claude` | Claude chat with web search | — | `model` |
| `exa` | Exa search | Exa research | — |
| `firecrawl` | Firecrawl search | — | `sources`, `limit` |
| `gemini` | Gemini grounded | Gemini Deep Research | `quick: grounded \| chat` |
| `google` | Google results via a SERP collector | — | `collector: searchapi \| serpapi \| serpbase`, `vertical: web \| news` |
| `grok` | Grok web search | — | `search: web \| x \| both` |
| `jina` | Jina search | — | — |
| `kagi` | Kagi FastGPT | — | — |
| `openai` | OpenAI chat with web search | OpenAI research | `model`, `effort` |
| `openrouter` | OpenRouter grounded | — | `quick: grounded \| chat`, `model` |
| `parallel` | Parallel turbo | Parallel research | `quick: turbo \| search`, `processor` (default `pro`) |
| `perplexity` | Sonar Pro | Deep Research | `quick: sonar-pro \| search \| agent`, `deep_effort: medium \| high` |
| `tavily` | Tavily search | — | — |
| `valyu` | Valyu search | Valyu research | `mode` (default `standard`), `output` |
| `you` | You.com answer | You.com research | `quick: answer \| research` |

Mapping from today's JS profiles and PHP profile ids to (source, depth,
option) lives in `sources.json` and is the migration table for config and
docs. Where a language lacks a variant today (for example SERP collectors that
only one language implements), `sources.json` records availability per
language; the APIs report it through `sources` / `list_sources`.

### Engines

| Engine | Collectors |
| --- | --- |
| `chatgpt` | searchapi, dataforseo (PHP), firecrawl (PHP adapter) |
| `gemini-app` | searchapi, dataforseo (PHP), firecrawl (PHP adapter) |
| `google-ai-mode` | searchapi, dataforseo (PHP), firecrawl (PHP adapter) |
| `google-ai-overview` | searchapi, firecrawl (PHP adapter) |
| `copilot` | searchapi, firecrawl (PHP adapter) |

The collector is configuration (`engines.collector`, per-engine override), not
part of the name. DataForSEO's standard/live task priority is a collector
option. The Firecrawl adapter additionally lets an app declare its own engine
by URL (section 9). Engines never join the default source set: they answer a
different question ("how do AI products describe X?") and cost per lookup.
Today's visibility "API baselines" are dropped; name `perplexity` or `gemini`
alongside engines to compare.

### Custom sources

JS custom providers and PHP custom drivers register a new source name with a
quick and/or deep variant (or as an engine) and appear exactly like built-ins.

## 4. Contract

All JSON is `snake_case`; JS option names in code are camelCase. Money is a
decimal string in USD. Times are RFC 3339 UTC. Run ids are `run_` + ULID.
Schemas: `schema/request.schema.json`, `schema/run.schema.json`,
`schema/stored-run.schema.json`.

### Request

```json
{
  "question": "Replacing GA4 for an EU SaaS: compare Plausible, Fathom, and Matomo",
  "depth": "deep",
  "only": ["exa", "openai", "my-group"],
  "skip": [],
  "max_cost": "1.00",
  "dry_run": false,
  "options": { "parallel": { "processor": "ultra" } }
}
```

| Field | Rules |
| --- | --- |
| `question` | Required, non-empty. |
| `depth` | `quick` (default) or `deep`. |
| `only` | Source, engine, or group names; groups expand to their members. Omitted: every set-up research source (never engines). Naming something not set up is an error, not a silent skip. |
| `skip` | Names removed after expansion. |
| `max_cost` | Optional. Default from config. Over MCP it may only lower the configured cap. |
| `dry_run` | Return a Run with status `planned` and estimates; no provider calls; nothing written to the store. |
| `options` | Advanced per-source overrides, validated against `sources.json`. |

### Run

```json
{
  "spec": "librarium.run/1",
  "id": "run_01JAB2C3D4E5F6G7H8J9K0M1N2",
  "question": "…",
  "depth": "deep",
  "status": "running",
  "created_at": "2026-10-12T18:04:11Z",
  "finished_at": null,
  "cost": { "estimated": "0.35", "reported": "0.10", "complete": false, "max": "1.00" },
  "results": [
    {
      "source": "exa",
      "status": "done",
      "observation": "api",
      "answer": "## Findings\n…",
      "citations": [{ "url": "https://plausible.io/features", "title": "Plausible features" }],
      "cost": { "estimated": "0.10", "reported": "0.10" },
      "started_at": "2026-10-12T18:04:12Z",
      "duration_ms": 122000,
      "provenance": { "provider": "exa", "variant": "research", "model": null, "collector": null },
      "error": null
    }
  ],
  "skipped": [{ "source": "kagi", "reason": "no_deep_variant" }],
  "notices": []
}
```

- Run `status`: `planned` (dry run), `running`, `done` (all results done),
  `partial` (some failed), `failed` (none succeeded).
- Result `status`: `queued`, `running`, `done`, `failed`. `error` is
  `{ "code", "message", "retryable" }`. Interrupted inline work is `failed`
  with code `interrupted`.
- `observation`: `api` for research sources, `surface` for engines.
- Skip reasons: `not_configured`, `no_deep_variant`, `unpriced`,
  `over_budget`, `excluded`, `no_collector`.
- `answer` is Markdown (null for search-only sources); `citations` always
  present. Raw provider bodies are evidence in the store, never inline.
- `cost.reported` is provider-reported only; unknown is `null`, never `"0"`.
  `cost.complete` is true only when every result reported a cost.

### Budget rule (identical in both languages)

With `max_cost`: skip sources without a bounded estimate (`unpriced`); then
walk the remaining sources in catalog order (the order of `sources.json`),
admitting each whose estimate still fits the remaining budget; the rest are
`over_budget`. Without `max_cost`, sources without an estimate still run and
`cost.estimated` is `null`. `skipped` is listed in catalog order.

Selection errors (the request fails before any Run is stored):
`unknown_name`, `not_configured` (a named source, or an engine with no
configured collector), `group_name_conflict` (config), `no_sources` (nothing
set up and no `only`). The fixtures in `fixtures/selection/` are normative.
During the run, reported spend plus reservations stops unstarted work.
In-flight calls may finish above the cap; docs say so.

## 5. Lifecycle

Every non-dry-run request creates the Run in the store before any provider
call. Waiting is a client choice, not a request field. One Run never mixes
depths, so there is no mode.

- **quick** results run inline in the calling process.
- **deep** results are durable provider tasks. Their signed handles are saved
  in the Run's private state, so any later `show` / `get` / `find()->refresh()`
  can observe and finish them. Every deep variant must be durable in both
  languages (PHP must add recoverable handles for OpenAI and You.com research).

| Surface | Default | Not waiting |
| --- | --- | --- |
| CLI | waits with live progress; Ctrl-C detaches and prints `librarium show <id>` | `--no-wait` |
| MCP | waits up to `wait_seconds` (default 45, max 50), then returns the Run as `running` | `wait_seconds: 0` |
| JS | `await research()` resolves when the Run finishes | `{ wait: false }` |
| PHP | `run()` waits | `queue()` dispatches one encrypted job and returns the running Run's id |

## 6. Storage

### Interface

Each language defines `RunStore` with four methods. A store persists one
`StoredRun` document per Run: `{ run, state, files, version }`, where `state`
is private (signed provider handles, ledger, reservations) and `files` maps
names (`answers/<source>.md`, `evidence/<source>.json`) to contents.

```ts
export interface RunStore {
  get(id: string): Promise<StoredRun | null>;
  /** Write if the stored version equals expectedVersion (null = must not exist).
   *  Returns the new version; throws RunStoreConflict otherwise. */
  save(doc: StoredRun, expectedVersion: number | null): Promise<number>;
  list(opts?: { limit?: number; before?: string }): Promise<RunSummary[]>; // newest first
  delete(id: string): Promise<void>;
}
```

```php
interface RunStore
{
    public function find(string $id): ?StoredRun;

    /** @throws RunStoreConflict */
    public function save(StoredRun $run, ?int $expectedVersion): int;

    /** @return list<RunSummary> newest first */
    public function list(int $limit = 50, ?string $before = null): array;

    public function delete(string $id): void;
}
```

`StoredRun` serializes to `schema/stored-run.schema.json` in both languages.

### Built-in stores

| Store | JS | PHP |
| --- | --- | --- |
| `filesystem` | default for the CLI, MCP and `librarium/node` | default; any Laravel disk; encrypted with the app key unless `encrypt` is false |
| `database` | — | opt-in: any connection, one table (`librarium_runs` by default), one row per Run holding run, state, files and version; query builder, no Eloquent; migration published with `vendor:publish --tag=librarium-migrations` and never auto-run |
| `cache` | — | any Laravel cache store, with a TTL |
| `memory` | default for `librarium/core` (Workers, browsers) | tests |

Filesystem layout, shared by both languages:

```text
<path>/<run_id>/run.json
<path>/<run_id>/state.json
<path>/<run_id>/answers/<source>.md
<path>/<run_id>/evidence/<source>.json
```

An unencrypted folder written by one language is readable by the other.

### Adding a store

| | JS | PHP |
| --- | --- | --- |
| Implement | a class with the four methods | a class implementing `RunStore` |
| Register | `createLibrarium({ store })`; CLI/MCP config `"runs": { "store": { "module": "./stores/redis.js" } }` whose default export returns a store | `'runs' => ['store' => 'redis']` plus `Librarium::extendStore('redis', fn ($app, array $config) => …)`, or a class name |
| Check | `import { runStoreContract } from 'librarium/testing'` | `uses(RunStoreContractTests::class)` with a `store()` factory |

Both test kits run the cases in `fixtures/run-store/` (create, conflict on a
stale version, not found, list order and paging, delete, round trip of a
fixture Run). Every built-in store passes them.

### Rules

- No credentials are ever stored. Evidence is redacted before it reaches a
  store, with PHP's current redaction semantics, which JS adopts.
- PHP signs stored provider handles with the app key so a tampered store
  cannot redirect retrieval.
- Retention: `runs.keep_days` (default unset); `librarium cleanup` and
  `php artisan librarium:prune`.
- Concurrent writers (queue worker vs `refresh()`) are safe through the
  version check.

## 7. Surfaces

### CLI

```bash
librarium research "q"                                  # quick, set-up sources, waits
librarium research "q" --deep                           # deep, background, waits with progress
librarium research "q" --only exa,openai --max-cost 1   # narrow and cap
librarium research "q" --only chatgpt,copilot           # engines (visibility)
librarium research "q" --deep --dry-run                 # planned Run, no calls
librarium research "q" --deep --no-wait                 # print the id and exit
librarium show [run-id] [--wait] [--source exa] [--json]   # default: latest Run
librarium summarize [run-id] [--verify]                 # synthesis over a stored Run
librarium sources [--json]                              # sources, engines, groups, variants, prices
librarium groups add <name> <names…> | remove <name>
librarium setup [--check] [--live]                      # keys, options, default max_cost; --check = doctor
librarium mcp
```

Kept tools: `browse`, `html`, `jsonl`, `usage`, `cleanup`, `config`,
`completions`, `upgrade`, `install-skill`. `--json` prints the Run.

### MCP (three tools)

| Tool | Input | Output |
| --- | --- | --- |
| `research` | `question`, `depth?`, `only?`, `skip?`, `max_cost?` (lower only), `dry_run?`, `wait_seconds?` | Run summary: id, status, per-source status and citation counts, cost, skipped, next-step hint |
| `get_run` | `id`, `wait_seconds?`, `source?`, `cursor?` | summary, or one source's answer and citations, paged |
| `list_sources` | — | sources, engines and groups: set up or not, variants, price hints |

### JavaScript

```ts
import { createLibrarium } from 'librarium';

const librarium = createLibrarium();               // config + filesystem store
const run = await librarium.research(q, { depth: 'deep', only: ['exa'], maxCost: '1.00' });
const started = await librarium.research(q, { depth: 'deep', wait: false });
const later = await librarium.get(started.id, { wait: true });
librarium.sources();
await librarium.summarize(run);
// librarium/core: createLibrarium({ config, store })
```

### PHP

```php
$run = Librarium::research($q)->deep()->only(['exa', 'openai'])->maxCost('1.00')->run();
$plan = Librarium::research($q)->deep()->dryRun();
$queued = Librarium::research($q)->deep()->queue()->onQueue('research')
    ->then(fn (Run $run) => /* … */);     // $queued->id()
$run = Librarium::find($id)->refresh();  // one observation of pending deep sources
$run->evidence('exa');                   // redacted provider body
$run->toArray();                         // contract JSON
Librarium::sources();
```

Artisan: `librarium:research`, `librarium:show`, `librarium:sources`,
`librarium:prune`. The Laravel AI SDK evidence tool stays and reads Runs.

PHP method mapping: `run()` stays; `collect()` folds into stored evidence
(`$run->evidence()`, `$run->diagnostics()`); `collectSensitive()` is removed;
`submit()`/`retrieve()` fold into `queue()` + `find()`/`refresh()`;
`preview()`/`spendingBound()` become `dryRun()`; `using()`, `fanOut()`,
`group()`, `matching()`, `fallbacks()` become `only()`/`skip()`/`deep()`.

## 8. Configuration

JS (`version: 3`, written by `librarium setup`):

```json
{
  "version": 3,
  "sources": {
    "exa": { "key": "env:EXA_API_KEY" },
    "parallel": { "key": "env:PARALLEL_API_KEY", "processor": "pro" },
    "grok": { "key": "env:XAI_API_KEY", "search": "both", "enabled": false }
  },
  "engines": { "collector": "searchapi", "key": "env:SEARCHAPI_API_KEY" },
  "groups": { "visibility": ["chatgpt", "gemini-app", "google-ai-mode", "google-ai-overview", "copilot"] },
  "max_cost": "1.00",
  "runs": { "store": "filesystem", "path": "./agents/librarium", "keep_days": null }
}
```

PHP (`config/librarium.php`): `sources`, `engines`, `groups`, `max_cost`,
`runs` (`store`, `disk`, `path`, `connection`, `table`, `encrypt`,
`keep_days`), `timeout`. A source is set up when it has a key and `enabled` is
not `false`. A group name equal to a source or engine name is a config error.

Migration: JS 1.x configs migrate to v3 on load with a written backup
(providers become sources, extra profiles become options, `mode` and fallbacks
dropped with notices, custom groups kept as groups, the built-in visibility
group becomes a `visibility` group of engines). Config v2 never shipped. PHP
1.0 is unreleased; its config is rewritten. v1 run directories are not
readable by `show` (documented).

## 9. Firecrawl

- Firecrawl search becomes a built-in PHP source (`firecrawl`), written with
  Laravel HTTP like the other drivers, matching JS.
- `laravel-ai-librarium-firecrawl` keeps only browser collection (SDK
  `interact` and async `agent` modes). It registers `firecrawl` as an engine
  collector and lets apps declare custom engines by URL. Its async job handle
  lives in the Run's private state; its webhook is a wake hint for that Run.

## 10. Removed and renamed

| Today | Becomes |
| --- | --- |
| `run` | `research` |
| `-p provider/profile`, `-g`, built-in groups, `custom:`, `list_groups` | `--only` / `--skip` with sources, engines, or groups; `--deep` |
| `visibility` group | engines named in `only`, or a saved group |
| `--mode`, `mixed` | automatic |
| `--no-fallback`, fallbacks, reserves | removed |
| `--max-estimated-cost` | `--max-cost` |
| `plan`, `preview()`, `spendingBound()` | `--dry-run`, `dryRun()` |
| `status`, `check_async`, `get_results`, `retrieve()` | `show`, `get_run`, `find()`/`refresh()` |
| `answer`, `answer --verify` | `summarize [id]`, `summarize --verify` |
| `refine`, `--refine` | removed |
| `ls`, `init`, `doctor` | `sources`, `setup`, `setup --check` |
| `live-validation` | maintainer script |

Removed names fail with a message naming the replacement.

## 11. This package

`jkudish/librarium-spec`, published to npm (`librarium-spec`) and Packagist
(`jkudish/librarium-spec`). Data and tests only, no runtime code:

```text
SPEC.md
schema/request.schema.json  schema/run.schema.json  schema/stored-run.schema.json
sources.json                sources and engines in catalog order: variants,
                            options, credential env names, per-language
                            availability, and the legacy JS profile and PHP
                            profile ids each variant replaces
fixtures/selection/         config + request → selected sources, skips, budget outcome
fixtures/runs/              valid and invalid Run documents
fixtures/run-store/         RunStore contract cases
```

Pricing stays in each package (the JS pricing snapshot and PHP
laravel-ai-pricing), because they read different price sources. JS v1 config
migration is JS-only, so its fixtures live in the JS repo.
`scripts/check.mjs` validates the fixtures against the schemas and a reference
selection implementation; it is test-only and not published.

Both packages pin a minor version and run the fixtures in their test suites.
This replaces `contracts/v1` in the JS repo and the PHP `typescript:repin`
step. The website reads `sources.json` for its provider grid and counts.

## 12. Verification

- JS: build, test, typecheck, lint, `test:workers`, `test:integration`,
  `test:pty`, `test:declarations`, and the shared fixtures.
- PHP: `composer test`, `analyse`, `format:check`, `validate --strict`, lowest
  and highest dependency lanes, shared fixtures, `pr:check` at the final head.
- Cross-language: the same fixtures pass in both; an unencrypted Run folder
  written by JS is read by PHP `find()` and vice versa.
- No live provider calls until the lead's canary, under a separately approved
  cap.
