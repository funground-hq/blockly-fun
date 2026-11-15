// Shared by the tests of the catalogue (tests/catalogue*.test.js): the funground fixtures, and Python -> blocks.
//
// The fixtures in tests/fixtures/funground/ are copies of funground's completions.json and type_cases.json (see
// ABOUT.txt there). The editor never reads them: the host gives it the catalogue.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = process.env.BF_PYTHON || "C:\\Projects\\playground\\.venv\\Scripts\\python.exe";
const PACKAGE = join(ROOT, "python");
const FIXTURES = join(ROOT, "tests", "fixtures", "funground");

export const completions = JSON.parse(readFileSync(join(FIXTURES, "completions.json"), "utf8"));
export const typeCases = JSON.parse(readFileSync(join(FIXTURES, "type_cases.json"), "utf8"));

/** convert() for each source, in one Python process (as tests/roundtrip.test.js does). */
export function convertAll(sources) {
  const script = `import sys; sys.path.insert(0, ${JSON.stringify(PACKAGE)}); from blockly_fun.__main__ import main; main()`;
  const result = spawnSync(PYTHON, ["-I", "-c", script], {
    input: JSON.stringify({ sources }), encoding: "utf8", timeout: 60000, maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) throw new Error(`to_blocks failed: ${result.stderr}`);
  return JSON.parse(result.stdout);
}
