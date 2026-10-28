# librarium-spec

[![npm](https://img.shields.io/npm/v/librarium-spec?label=npm)](https://www.npmjs.com/package/librarium-spec)
[![Packagist version](https://img.shields.io/packagist/v/jkudish/librarium-spec)](https://packagist.org/packages/jkudish/librarium-spec)
[![License: MIT](https://img.shields.io/npm/l/librarium-spec?color=blue)](LICENSE)

<p align="center">
  <img src=".github/librarium-banner.png" alt="librarium: Give your agent more than one source." />
</p>

Shared data for Librarium: request, Run and stored-Run JSON schemas, the source catalog, and conformance fixtures. [Librarium](https://github.com/jkudish/librarium) (JavaScript, CLI and MCP) and [Laravel AI Librarium](https://github.com/jkudish/laravel-ai-librarium) (PHP) both read it, so a Run written by one validates in the other.

It contains data and tests only, no runtime code. Most people get it as a dependency of those packages. Install it directly when you build a Librarium-compatible tool, store, or report reader.

## Install

```bash
npm install librarium-spec@^1.0
composer require jkudish/librarium-spec:^1.0
```

## Use

JavaScript (ESM):

```js
import sources from 'librarium-spec/sources.json' with { type: 'json' };

console.log(sources.sources.map((source) => source.name));
```

PHP: the files install as plain data. Find them through Composer:

```php
use Composer\InstalledVersions;

$root = InstalledVersions::getInstallPath('jkudish/librarium-spec');
$sources = json_decode(file_get_contents($root.'/sources.json'), true, flags: JSON_THROW_ON_ERROR);
```

## Contents

| Path | What it holds |
| --- | --- |
| `SPEC.md` | The specification: research requests, source selection, depth, cost limits, Runs, and the RunStore contract |
| `schema/request.schema.json` | A research request |
| `schema/run.schema.json` | A Run: results, sources, usage, and cost |
| `schema/stored-run.schema.json` | The document a RunStore saves for one Run |
| `sources.json` | Sources and AI answer engines in catalog order, with variants, options, credential variable names, and per-language availability |
| `fixtures/selection/` | Configuration and request in, selected sources, skips, and budget outcome out |
| `fixtures/runs/` | Valid and invalid Run documents |
| `fixtures/run-store/` | RunStore contract cases and an example filesystem layout |

Pricing is not part of the spec. Each package reads its own price source.

## Versioning

Schemas, `sources.json` and fixtures follow semantic versioning. Consumers pin a minor version and run the fixtures in their test suites. A breaking change to a schema or to selection behavior needs a new major version.

## Develop

```bash
npm ci
npm test
```

`npm test` runs `scripts/check.mjs`, which validates every fixture against the schemas and a reference selection implementation.

Read the full [specification](SPEC.md).

## The Librarium family

- [Librarium](https://github.com/jkudish/librarium): the JavaScript CLI, MCP server and library (`npm install -g librarium`).
- [Laravel AI Librarium](https://github.com/jkudish/laravel-ai-librarium): the Laravel package (`composer require jkudish/laravel-ai-librarium`).
- [Laravel AI Librarium: Firecrawl](https://github.com/jkudish/laravel-ai-librarium-firecrawl): collects AI answer engine results for the Laravel package through Firecrawl browser sessions.
- [librarium.si](https://librarium.si): documentation for all of them.

## Sponsoring

If you find the Librarium spec useful, consider becoming a [sponsor](https://github.com/sponsors/jkudish) or [donating](https://stripe.com/@jkudish).

## Contributing and security

To report a vulnerability, see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
