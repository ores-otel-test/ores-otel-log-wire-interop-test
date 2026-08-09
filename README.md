# ores-otel-log-wire-interop-test

Native exact-head conformance harness for **nodejs**.

This repository compiles and tests both `ores-otel/ores.otel.log` at `05f14768232b770dfc2bbe03f27b388f5a701c74` and `ORESoftware/next-loggers.ts` at `05f14768232b770dfc2bbe03f27b388f5a701c74`.
The declared native command is `npm ci && npm test`; the workflow also validates the shared JSON Schema and SDK API manifests before running the language toolchain.
