# ORES APM peer-authority canary

This test repository independently consumes the immutable ORES APM v1 authority at
`ores-otel/ores-interfaces@942428dc36face4fb50eaac433e6219db648748a`.

The authority has two independent, first-class authored sources:

- TypeSpec: `contracts/ores-apm/v1/ores-apm.tsp`
- JSON Schema Draft 2020-12: `contracts/ores-apm/v1/ores-apm.schema.json`

The canary pins TJSV and requires the full workflow: TypeSpec is compiled with the
official JSON Schema emitter into comparison-only Schema B; generated Schema B is
compared with authored Schema A; differential probes must converge. Generated Schema
B, Contract IR, receipts, and fixtures are evidence only and never become an authored
authority.

A negative control mutates only the temporary copy of authored JSON Schema and requires
TJSV to fail closed. The test never writes to either source repository and never uses a
mutable branch or tag as authority provenance.
