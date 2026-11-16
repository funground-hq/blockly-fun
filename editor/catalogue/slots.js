// Signatures and the slots a chosen name brings (Funground_Calls_Note.md, section 7).

/** Splits at commas that are not inside brackets or quotes. */
function splitTop(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === "\"") quote = ch;
    else if ("([{".includes(ch)) depth++;
    else if (")]}".includes(ch)) depth--;
    else if (ch === "," && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}

/**
 * "text_align(horizontal, vertical=None)" gives {name, params: [{name, required, star, default}]}.
 * A property ("nose") has no brackets and no params. The bare `*` and `/` markers are dropped.
 */
export function parseSignature(signature) {
  const open = signature.indexOf("(");
  if (open < 0 || !signature.endsWith(")")) return { name: signature, params: [] };
  const params = [];
  for (const part of splitTop(signature.slice(open + 1, -1))) {
    if (part === "*" || part === "/") continue;
    const star = part.startsWith("**") ? "**" : part.startsWith("*") ? "*" : null;
    const body = star ? part.slice(star.length) : part;
    const eq = body.indexOf("=");
    const name = (eq < 0 ? body : body.slice(0, eq)).trim();
    params.push({ name, star, default: eq < 0 ? null : body.slice(eq + 1).trim(), required: eq < 0 && !star });
  }
  return { name: signature.slice(0, open), params };
}

/** The label of a slot: the parameter's name, with spaces for underscores. */
export const slotLabel = (param) => param.name.replace(/_/g, " ");

/** The parameters a positional argument can stand for, in order (a `*more` or `**kw` takes none). */
export const positionalParams = (entry) => entry.params.filter((p) => !p.star);

/**
 * What a new slot holds so the block runs at once (note, section 7): a number; "tomato" for a colour; the first word
 * for an options slot; nothing otherwise. Gives {number}, {text}, or null for an empty slot.
 */
export function defaultFor(catalogue, entry, param) {
  const raw = entry.raw;
  const kind = raw.kinds?.[param.name]?.kind;
  if (kind === "colour" || catalogue.isColourParam(entry, param.name)) return { text: "tomato" };
  const word = raw.options?.[param.name]?.[0]?.word;
  if (word) return { text: word };
  if (kind === "range") {
    const { low, high, step } = raw.kinds[param.name];
    const places = (String(step ?? 1).split(".")[1] || "").length;
    return { number: Number(((low + high) / 2).toFixed(places)) };
  }
  if (kind === "pixels") return { number: 100 };
  if (kind === "angle") return { number: 45 };
  if (kind === "file") return null;
  const typed = new RegExp(`(?:^|[(,])\\s*${param.name}:\\s*(?:float|int)\\b`);
  return typed.test(raw.detail || "") ? { number: 0 } : null;
}
