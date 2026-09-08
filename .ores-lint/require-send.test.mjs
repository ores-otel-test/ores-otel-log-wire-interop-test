import assert from 'node:assert/strict';

import { analyzeSource, formatReport } from './require-send.mjs';

const expectFindings = (name, source, language, expected) => {
  const actual = analyzeSource(source, language);
  assert.equal(
    actual.length,
    expected,
    `${name}: expected ${expected} finding(s), got ${actual.length}: ${JSON.stringify(actual)}`,
  );
  return actual;
};

expectFindings('Rust flags an undelivered chain', 'logger.info("lost");', 'rust', 1);
expectFindings('Rust accepts an inline send', 'logger.info("sent").send();', 'rust', 0);
expectFindings(
  'Rust tracks an event until a later send',
  'let event = logger.warn("queued");\nevent.send();',
  'rust',
  0,
);
expectFindings('Rust flags an assigned event that leaves scope', '{ let event = logger.error("lost"); }', 'rust', 1);
expectFindings('Rust accepts a returned event handoff', 'return logger.debug("handoff");', 'rust', 0);
expectFindings('Rust accepts a tail-expression handoff', 'logger.trace("handoff")', 'rust', 0);
expectFindings(
  'Rust accepts the convenience emitter',
  'logger.log(level, message, context, fields);',
  'rust',
  0,
);
expectFindings('Rust ignores an unrelated fluent API', 'builder.info("metadata");', 'rust', 0);

expectFindings('Dart flags an undelivered chain', 'logger.info("lost");', 'dart', 1);
expectFindings('Dart accepts send with a boolean', 'logger.info("sent").send(true);', 'dart', 0);
expectFindings('Dart accepts an awaited legacy emit', 'await logger.info("sent", fields: fields);', 'dart', 0);
expectFindings('Dart still rejects an unawaited legacy-shaped emit', 'logger.info("lost", fields: fields);', 'dart', 1);
expectFindings(
  'Dart tracks a final event until delivery',
  'final event = logger.warn("queued");\nevent.send();',
  'dart',
  0,
);
expectFindings('Dart accepts a returned event handoff', 'return logger.error("handoff");', 'dart', 0);

expectFindings('Gleam flags an undelivered pipeline head', 'logging.info("lost")', 'gleam', 1);
expectFindings(
  'Gleam accepts a piped send',
  'logging.info("sent")\n|> logging.send',
  'gleam',
  0,
);
expectFindings(
  'Gleam tracks an event until a functional send',
  'let event = logging.warn("queued")\nlogging.send(event)',
  'gleam',
  0,
);

expectFindings(
  'Comments and strings do not create findings',
  '// logger.info("comment")\nlet sample = "logger.warn(\\"string\\")";',
  'rust',
  0,
);
expectFindings(
  'The next-line suppression is local',
  '// ores-lint-disable-next-line require-send\nlogger.info("intentional");\nlogger.info("lost");',
  'rust',
  1,
);
expectFindings(
  'The file suppression covers every chain',
  '// ores-lint-disable-file require-send\nlogger.info("intentional");\nlogger.warn("intentional");',
  'dart',
  0,
);

const report = formatReport([
  {
    file: 'src/example.rs',
    findings: expectFindings('Reporting preserves locations', '\nlogger.fatal("lost");', 'rust', 1),
  },
]);
assert.match(report, /1 finding\(s\) across 1 rule\(s\)/);
assert.match(report, /src\/example\.rs:2:1/);

process.stdout.write('require-send fixtures passed\n');

