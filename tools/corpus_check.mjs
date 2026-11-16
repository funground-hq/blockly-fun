// The round trip over real code, beyond the contract programs: each .py file of the folders given goes Python -> blocks
// (to_blocks, CPython) -> Python (our generator), and is checked as property 3 checks a program outside the subset.
//
//   export PATH=/c/sw/nodejs:$PATH
//   node tools/corpus_check.mjs examples=C:/Projects/playground/examples pygame=C:/Projects/funground-corpora/pygame-ce
//        [--out report.json]
//
// For each file: refused (it is not Python 3 this parser reads), crashed (a converter or generator bug), lost (the
// regenerated program differs from the original as Python reads it, or a comment is missing or moved), tidied (the
// same program, other text), exact (byte for byte). And how much became real blocks: the share of the file's lines held
// in "Python code" blocks. Files are read as UTF-8 with \r\n made \n; others are skipped and counted.

import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { toPython } from "../editor/index.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PYTHON = process.env.BF_PYTHON || "C:\\Projects\\playground\\.venv\\Scripts\\python.exe";
const BATCH = 40;

function python(request) {
  const result = spawnSync(PYTHON, ["-I", join(ROOT, "tools", "corpus_check.py")], {
    input: JSON.stringify(request), encoding: "utf8", maxBuffer: 1 << 28, timeout: 600000,
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return JSON.parse(result.stdout);
}

function pythonFiles(folder) {
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      if (name === "__pycache__" || name.startsWith(".") || name === "node_modules") continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".py")) found.push(path);
    }
  };
  walk(folder);
  return found;
}

/** Lines of the program held in "Python code" blocks, and blocks in all. */
function measure(workspace) {
  let blocks = 0;
  let rawLines = 0;
  const visit = (b) => {
    if (!b) return;
    blocks += 1;
    if (b.type === "bf_code" || b.type === "bf_code_value") {
      const text = b.fields?.TEXT ?? "";
      // a comment-only block is not code without a block: comments have no block of their own anywhere
      if (!text.split("\n").every((line) => line.trim() === "" || line.trim().startsWith("#"))) {
        rawLines += text.split("\n").length;
      }
    }
    for (const input of Object.values(b.inputs ?? {})) visit(input.block ?? input.shadow);
    visit(b.next?.block);
  };
  (workspace.blocks?.blocks ?? []).forEach(visit);
  return { blocks, rawLines };
}

const args = process.argv.slice(2);
const outIndex = args.indexOf("--out");
const out = outIndex >= 0 ? args.splice(outIndex, 2)[1] : null;
const report = {};

for (const spec of args) {
  const [name, folder] = spec.split(/=(.*)/s);
  const files = pythonFiles(folder);
  const entry = { files: files.length, skipped: 0, refused: 0, crashed: [], lost: [], tidied: 0, tidiedFiles: [], exact: 0,
    lines: 0, rawLines: 0, allBlocks: 0, ms: 0 };
  const texts = [];
  const names = [];
  for (const file of files) {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(file)).replace(/\r\n/g, "\n");
      texts.push(text);
      names.push(relative(folder, file).replace(/\\/g, "/"));
    } catch {
      entry.skipped += 1;
    }
  }
  const started = performance.now();
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH);
    const converted = python({ convert: slice });
    const pairs = [];
    const where = [];
    converted.forEach((result, j) => {
      const file = names[i + j];
      if (result.crash) { entry.crashed.push({ file, why: result.crash.trim().split("\n").slice(-1)[0] }); return; }
      if (!result.ok) { entry.refused += 1; return; }
      let text;
      try {
        text = toPython(result.workspace);
      } catch (error) {
        entry.crashed.push({ file, why: "generator: " + error.message });
        return;
      }
      const lines = slice[j].split("\n").length - 1;
      const { blocks, rawLines } = measure(result.workspace);
      entry.lines += lines;
      entry.rawLines += Math.min(rawLines, lines);
      if (rawLines === 0) entry.allBlocks += 1;
      void blocks;
      if (text === slice[j]) { entry.exact += 1; return; }
      pairs.push([slice[j], text]);
      where.push(file);
    });
    if (pairs.length) {
      python({ compare: pairs }).forEach((verdict, k) => {
        if (verdict.ast && verdict.comments) { entry.tidied += 1; entry.tidiedFiles.push(where[k]); }
        else entry.lost.push({ file: where[k], ast: verdict.ast, comments: verdict.comments, error: verdict.error });
      });
    }
  }
  entry.ms = Math.round(performance.now() - started);
  entry.converted = entry.exact + entry.tidied + entry.lost.length;
  entry.blockShare = entry.lines ? +(1 - entry.rawLines / entry.lines).toFixed(3) : null;
  report[name] = entry;
  console.error(`${name}: ${entry.files} files, ${entry.converted} converted, exact ${entry.exact}, tidied ${entry.tidied}, ` +
    `lost ${entry.lost.length}, crashed ${entry.crashed.length}, refused ${entry.refused}, ` +
    `lines in blocks ${entry.blockShare}, all blocks ${entry.allBlocks}, ${entry.ms} ms`);
}

if (out) writeFileSync(out, JSON.stringify(report, null, 2));
else console.log(JSON.stringify(report, null, 2));
const bad = Object.values(report).some((e) => e.lost.length || e.crashed.length);
process.exit(bad ? 1 : 0);
