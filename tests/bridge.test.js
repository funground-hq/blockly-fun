// Phase C, without a browser: the bridge to the runner (python_bridge.js) and the tidy count (BF-D-012).
// The browser itself is checked by tools/browser_check.mjs.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CONVERTER_FILES, runnerConverter } from "../editor/python_bridge.js";
import { tidiedLines } from "../editor/index.js";

function fakeRunner(answer) {
  const calls = [];
  return { calls, check: async (source, options) => { calls.push({ source, options }); return answer; } };
}

test("the converter runs as a check: its files and the text beside a script that prints the answer", async () => {
  const runner = fakeRunner({ tests: [], output: '{"ok": true, "workspace": {}, "raw": 0}\n', error: null });
  const files = Object.fromEntries(CONVERTER_FILES.map((path) => [path, new Uint8Array([1])]));
  const convert = runnerConverter(runner, files);
  assert.deepEqual(await convert('print("é")\n'), { ok: true, workspace: {}, raw: 0 });
  const [{ source, options }] = runner.calls;
  assert.match(source, /from blockly_fun import convert/);
  assert.deepEqual(options.tests, []);
  assert.deepEqual(Object.keys(options.files).sort(), [...CONVERTER_FILES, "source.txt"].sort());
  assert.equal(new TextDecoder().decode(options.files["source.txt"]), 'print("é")\n');
});

test("a converter that fails in the browser says so, and a refusal comes back as it is", async () => {
  await assert.rejects(runnerConverter(fakeRunner({ tests: [], output: "", error: "Traceback ..." }), {})("x\n"),
    /the converter failed in the browser: Traceback/);
  const refusal = { ok: false, line: 2, message: "Line 2 is not finished Python yet, so it cannot become blocks." };
  const runner = fakeRunner({ tests: [], output: JSON.stringify(refusal), error: null });
  assert.deepEqual(await runnerConverter(runner, {})("x = 1\nif x\n"), refusal);
});

test("the tidy note counts the lines the plain style rewrote", () => {
  assert.equal(tidiedLines("x = 1\n", "x = 1\n"), 0);
  assert.equal(tidiedLines("x=1\nprint('a')\n", "x = 1\nprint(\"a\")\n"), 2);
  assert.equal(tidiedLines("a = 1\nb = 2\n", "b = 2\na = 1\n"), 0);   // moved, not rewritten
});
