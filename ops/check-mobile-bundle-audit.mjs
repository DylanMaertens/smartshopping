#!/usr/bin/env node
// Reachability evidence, not an audit exemption. Inspect a freshly exported
// release source map; this does not cover native libraries or server tooling.
import { readFileSync } from 'node:fs';

const [auditPath, sourceMapPath] = process.argv.slice(2);
if (!auditPath || !sourceMapPath) throw new Error('Usage: node ops/check-mobile-bundle-audit.mjs audit.json release.hbc.map');
const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
if (audit.error || !audit.metadata?.vulnerabilities || !audit.advisories) {
  throw new Error('Expected a successful pnpm JSON audit report, not an audit/network error.');
}
const advisories = Object.values(audit.advisories);
if (advisories.some(({ module_name: name }) => typeof name !== 'string' || !name)
    || (!advisories.length && Object.values(audit.metadata.vulnerabilities).some((count) => count > 0))) {
  throw new Error('Incomplete advisory details: cannot determine bundle exposure.');
}
function sourcesOf(map) {
  return [...(map.sources ?? []), ...(map.sections ?? []).flatMap(({ map: child }) => sourcesOf(child))];
}
const sources = sourcesOf(JSON.parse(readFileSync(sourceMapPath, 'utf8')))
  .map((source) => source.replaceAll('\\', '/'));
if (!sources.length || !sources.some((source) => /(?:^|\/)src\/.*\.[jt]sx?$/.test(source))) {
  throw new Error('Missing app sources: export Android with --source-maps before interpreting results.');
}
const packages = [...new Set(advisories.map(({ module_name }) => module_name))];
const result = packages.map((name) => ({
  name,
  sources: sources.filter((source) => `/${source}`.includes(`/node_modules/${name}/`)),
}));
console.log(JSON.stringify({
  sourceCount: sources.length,
  packages: result,
  scope: 'JavaScript Android export only. Does not clear the dependency audit or cover native/server code.',
}, null, 2));
if (result.some(({ sources: matches }) => matches.length)) process.exitCode = 1;
