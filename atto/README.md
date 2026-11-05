# Native AttoLang wire-policy source

`src/wire_log_policy.atto` is a pure AttoLang admission predicate intended
for future telemetry exporters. It does not implement a sender, receiver,
serialization or logger and has no compiler-executed evidence.

The Node loopback E2E tests exercise HTTP client→gateway→collector behavior
only. Separate exact-SHA canonical and legacy logger verification is still
mandatory for implementation conformance. Do not label these fixture tests
as a production logger run.
