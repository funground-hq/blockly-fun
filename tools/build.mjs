// Builds dist/: the editor as one ES module for a host page (dist/blockly-fun.js, Blockly inside) and, beside it,
// the converter's Python files (dist/blockly_fun/), which the host sends to its runner (python_bridge.js), and
// Blockly's media (dist/media/).
//
//   export PATH=/c/sw/nodejs:$PATH; npm run build
//
// The editors of slots (editor/editors/) bring five of Blockly's sample fields, bundled like Blockly (BF-D-029).
//
// `blockly` is Blockly's core (blockly/core): the package's main entry would also bring Blockly's own blocks and
// generators, which the editor never uses. Prints the sizes, plain and gzipped.

import { build } from "esbuild";
import { copyFileSync, cpSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { CONVERTER_FILES } from "../editor/python_bridge.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");

const blocklyCore = {
  name: "blockly-core",
  setup(builder) {
    builder.onResolve({ filter: /^blockly$/ }, (args) => builder.resolve("blockly/core", { kind: args.kind, resolveDir: args.resolveDir }));
  },
};

// field-colour and field-multilineinput also ship blocks for Blockly's own code generators and so import them
// (blockly/dart, javascript, lua, php, python: 140 KB). The editor installs none of those blocks, and the plugins'
// top-level code only passes the generators on, so an empty module stands in for each.
const noGenerators = {
  name: "no-generators",
  setup(builder) {
    builder.onResolve({ filter: /^blockly\/(dart|javascript|lua|php|python)$/ }, (args) => ({ path: args.path, namespace: "no-generators" }));
    builder.onLoad({ filter: /.*/, namespace: "no-generators" }, () => ({ contents: "module.exports = {};", loader: "js" }));
  },
};

rmSync(DIST, { recursive: true, force: true });
await build({
  entryPoints: [join(ROOT, "editor", "bundle.js")],
  outfile: join(DIST, "blockly-fun.js"),
  bundle: true,
  minify: true,
  format: "esm",
  legalComments: "none",
  plugins: [blocklyCore, noGenerators],
  logLevel: "warning",
});
// Blockly's icons and sounds (51 KB), for createBlocksEditor({media}): a host serves them beside the bundle
cpSync(join(ROOT, "node_modules", "blockly", "media"), join(DIST, "media"), { recursive: true });
for (const path of CONVERTER_FILES) {
  mkdirSync(join(DIST, dirname(path)), { recursive: true });
  copyFileSync(join(ROOT, "python", path), join(DIST, path));
}

const size = (path) => {
  const bytes = readFileSync(join(DIST, path));
  return `${(bytes.length / 1024).toFixed(0)} KB (${(gzipSync(bytes).length / 1024).toFixed(0)} KB gzipped)`;
};
console.log(`dist/blockly-fun.js ${size("blockly-fun.js")}`);
for (const path of CONVERTER_FILES) console.log(`dist/${path} ${size(path)}`);
