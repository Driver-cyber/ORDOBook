/**
 * Every page component App.jsx imports must actually be reachable by a route.
 *
 * Why this exists: on 2026-09-17 the Phase 7.1 route rewrite replaced a block of
 * App.jsx and silently swallowed ten routes with it — including the month-header
 * drill-downs, Import Data, Profile and Scenarios. `npm run build` passed, because
 * an unused import is not a build error. The first anyone knew was clicking a month
 * header and having nothing happen.
 *
 * A build that compiles is not a build that works. This asserts the one property
 * the compiler cannot see.
 *
 *     node scripts/verify_routes.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const app = readFileSync(join(root, 'src/App.jsx'), 'utf8')

// Components that are layout, not destinations.
const NOT_DESTINATIONS = new Set(['Sidebar', 'WorkspaceShell', 'ErrorBoundary'])

const imported = [...app.matchAll(/^import (\w+) from '\.\/(?:pages|components)\/[\w/]+'/gm)]
  .map(m => m[1])
  .filter(name => !NOT_DESTINATIONS.has(name))

const unrouted = imported.filter(name => !new RegExp(`<${name}\\s*/>`).test(app))

// Sanity: the file should contain a believable number of routes. A rewrite that
// drops the whole block would otherwise pass if it dropped the imports too.
const routeCount = (app.match(/<Route\b/g) || []).length
const MIN_ROUTES = 20

let failed = false

if (unrouted.length) {
  console.error(`FAIL  ${unrouted.length} page(s) imported but never routed:`)
  for (const name of unrouted) console.error(`        ${name}`)
  failed = true
} else {
  console.log(`PASS  all ${imported.length} imported pages are routed`)
}

if (routeCount < MIN_ROUTES) {
  console.error(`FAIL  only ${routeCount} <Route> elements — expected at least ${MIN_ROUTES}.`)
  console.error('      If routes were deliberately removed, lower MIN_ROUTES in this file.')
  failed = true
} else {
  console.log(`PASS  ${routeCount} routes declared`)
}

process.exit(failed ? 1 : 0)
