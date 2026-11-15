// How the editor reaches Python in the browser (phase C, BF-Q-2): the converter runs in funground-web's runner.
//
//   import { fetchConverter, runnerConverter } from "./editor/python_bridge.js";
//   const runner = await createRunner({ output, packages: [], reuse: true });   // plain Python, one worker kept
//   const convert = runnerConverter(runner, await fetchConverter(new URL("../python/", import.meta.url)));
//   await convert("x = 1\n");     // {ok, workspace, raw} or {ok: false, line, message}, as blockly_fun.convert gives
//
// The route is the runner's public check() (S-273), not a message of our own: the converter's .py files go in `files`,
// beside a three-line script that prints convert()'s answer as JSON, and check() hands back what it printed as one
// string. So no funground-web change is needed, and only one Python is in memory. Swapping the route (a runner message
// of its own, a Pyodide of the editor's own) changes this file only: the editor takes any `convert(source)` function.

/** The converter's files, by their path under python/ (the package to_blocks lives in). */
export const CONVERTER_FILES = ["blockly_fun/__init__.py", "blockly_fun/to_blocks.py"];

/** The text to convert travels as a file, so no quoting of it into Python source is needed. */
const SOURCE_FILE = "source.txt";

const SCRIPT = [
  "import json",
  "from blockly_fun import convert",
  `with open(${JSON.stringify(SOURCE_FILE)}, encoding="utf-8") as text:`,
  "    print(json.dumps(convert(text.read()), ensure_ascii=False))",
  "",
].join("\n");

/** Fetches the converter's files from `pythonUrl` (the python/ folder), as bytes by path. */
export async function fetchConverter(pythonUrl) {
  const entries = await Promise.all(CONVERTER_FILES.map(async (path) => {
    const response = await fetch(new URL(path, pythonUrl));
    if (!response.ok) throw new Error(`the converter's ${path} could not be fetched (${response.status})`);
    return [path, new Uint8Array(await response.arrayBuffer())];
  }));
  return Object.fromEntries(entries);
}

/**
 * A convert(source) function that runs blockly_fun.convert in `runner` (funground-web's createRunner, with
 * `packages: []`). It ends a run in progress, as any check() does: a host converts when nothing is running.
 */
export function runnerConverter(runner, converterFiles) {
  return async function convert(source) {
    const files = { ...converterFiles, [SOURCE_FILE]: new TextEncoder().encode(source) };
    const { output, error } = await runner.check(SCRIPT, { filename: "convert.py", files, tests: [] });
    if (error) throw new Error(`the converter failed in the browser: ${error}`);
    return JSON.parse(output);
  };
}
