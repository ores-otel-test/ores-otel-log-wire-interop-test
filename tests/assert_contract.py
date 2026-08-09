#!/usr/bin/env python3
from __future__ import annotations
import json
import os
import sys
from pathlib import Path

source = Path(sys.argv[1]).resolve()
contract = json.loads(Path(sys.argv[2]).read_text())
expected_language = os.environ["EXPECTED_LANGUAGE"]
manifest_path = source / "contracts" / "sdk-manifests" / f"{expected_language}.json"
manifest = json.loads(manifest_path.read_text())
assert manifest["language"] == expected_language
assert manifest["repositories"]["canonical"] == "ores-otel/ores.otel.log"
assert manifest["repositories"]["legacy"] == "ORESoftware/next-loggers.ts"
otel = manifest["telemetry"]["opentelemetry"]
assert otel["explicit"] is True
assert otel["automaticInstrumentation"] is False
assert otel["monkeyPatching"] is False
assert otel["ownsProvider"] is False
assert otel["wrapsLoggerCalls"] is True
for relative in manifest["conformance"]["sourceFiles"]:
    assert (source / relative).is_file(), relative
assert set(contract["sources"]) == {"ores-otel/ores.otel.log", "ORESoftware/next-loggers.ts"}
assert contract["exact_heads"]["canonical"]
assert contract["exact_heads"]["legacy"]
assert os.environ["EXPECTED_REPOSITORY"] in contract["sources"]
assert os.environ["EXPECTED_REF"] in contract["exact_heads"].values()
print(f"validated {expected_language} against {os.environ['EXPECTED_REPOSITORY']}@{os.environ['EXPECTED_REF']}")
