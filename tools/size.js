// Prints the size, in bytes and gzipped, of what the demo loads from Blockly and of our own editor files.
//   node tools/size.js
// The two lists are what demo/index.html loads (checked against a server's request log, 15 Nov 2026).

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const GROUPS = [
  ["Blockly 13.4.0, loaded by the page", [
    "node_modules/blockly/blockly_compressed.js",
    "node_modules/blockly/msg/en.js",
  ]],
  ["our editor", [
    "demo/blockly-global.js",
    "editor/index.js",
    "editor/blocks/register.js",
    "editor/blocks/table.js",
    "editor/generator/python.js",
  ]],
];

const pad = (value, width) => String(value).padStart(width);
let all = { raw: 0, gzip: 0 };

for (const [title, files] of GROUPS) {
  console.log(title);
  const total = { raw: 0, gzip: 0 };
  for (const file of files) {
    const data = fs.readFileSync(path.join(root, file));
    const gzip = zlib.gzipSync(data, { level: 9 }).length;
    console.log(`  ${pad(data.length, 9)} bytes  ${pad(gzip, 8)} gzip  ${file}`);
    total.raw += data.length;
    total.gzip += gzip;
  }
  console.log(`  ${pad(total.raw, 9)} bytes  ${pad(total.gzip, 8)} gzip  (total)\n`);
  all = { raw: all.raw + total.raw, gzip: all.gzip + total.gzip };
}
console.log(`${pad(all.raw, 11)} bytes  ${pad(all.gzip, 8)} gzip  everything the demo loads from Blockly and our editor`);
