# ores-otel-log-wire-interop-test

Exact-head **nodejs** conformance harness for `ores-otel/ores.otel.log` and `ORESoftware/next-loggers.ts`.

Native verification command: `npm ci && npm test`.

Promotion requires both sources to pass at explicit 40-character commit SHAs.

## Wire network integration fixture

`node --test harness/*.mjs` also exercises real loopback HTTP transport
through client→gateway→collector for tenant isolation, trace forwarding,
authorization suppression, scoped idempotency, hostile payload rejection, and
invalid trace contexts. This is a **fixture**, not canonical or legacy logger
source execution. The dedicated `network-e2e` workflow pins checkout to the
exact PR head and records executed steps. See `atto/README.md` for the separate
native AttoLang source-stage policy.
