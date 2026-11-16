// The index of funground's catalogue (Funground_Calls_Note.md, sections 3 and 4).
//
// The host gives the catalogue as a parsed object (completions.json); blockly-fun keeps no copy. createCatalogue()
// reads it once into maps by name, so every later question is one map read:
//   member(type, name)      the entry a type offers under a name
//   typeOfEntry(entry)      what a call of that entry gives back
//   scope(type)             the entries a name list offers on a type, in groups
//   property(type, name)    the entry an attribute read offers (BF-D-037); scope(type, {properties: true}) lists them
// A "type" is what an object is, as the type rule (types.js) works it out:
//   {kind: "f"}  {kind: "library", name}  {kind: "class", name}  {kind: "list", of}   or null for "do not know".

import { parseSignature } from "./slots.js";

const PLAIN_KINDS = new Set(["function", "class"]);

/** One name of the catalogue, with what searching it needs worked out once. */
export class Entry {
  constructor(raw, owner) {
    this.raw = raw;
    this.owner = owner;                      // {kind: "f"} | {kind: "library", name} | {kind: "class", name}
    this.name = raw.name;
    this.rank = typeof raw.rank === "number" ? raw.rank : 0;
    this.section = raw.section || null;
    this.lowerName = raw.name.toLowerCase();
    this.words = this.lowerName.split("_");
    this.also = (raw.also || []).map((w) => w.toLowerCase());
    this.text = `${raw.summary || ""} ${raw.plain || ""}`.toLowerCase();
    this.signature = raw.signature || raw.name;
    this.plain = raw.plain || raw.summary || "";
    this.url = raw.url || null;
    this.params = parseSignature(this.signature).params;
  }
}

/** Most used first, then by name (note, section 5). */
const byRank = (a, b) => b.rank - a.rank || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

export class Catalogue {
  constructor(raw, { helpBase = null } = {}) {
    this.raw = raw;
    this.helpBase = helpBase;
    this.functions = new Map();              // names of f: a call or a class
    this.values = new Map();                 // names of f that are values (width, key, mouse_x), read as attributes
    this.libraries = new Map();              // library name -> Map name -> Entry
    this.classes = new Map();                // class name -> Map name -> Entry (methods and properties)
    this.classesByMember = new Map();        // member name -> [class names], for an object of unknown class
    this.colourParams = new Set((raw.color_params || []).map((c) => `${c.function}.${c.parameter}`));
    this.scopes = new Map();                 // scope key -> groups, built on first use

    const owner = { kind: "f" };
    for (const item of raw.names || []) {
      if (PLAIN_KINDS.has(item.kind)) this.functions.set(item.name, new Entry(item, owner));
      else if (item.kind === "value") this.values.set(item.name, new Entry(item, owner));
    }
    for (const [library, items] of Object.entries(raw.libraries || {})) {
      const map = new Map();
      for (const item of items) map.set(item.name, new Entry(item, { kind: "library", name: library }));
      this.libraries.set(library, map);
    }
    for (const [cls, body] of Object.entries(raw.classes || {})) {
      const map = new Map();
      for (const item of body.members || []) map.set(item.name, new Entry(item, { kind: "class", name: cls }));
      this.classes.set(cls, map);
      for (const name of map.keys()) {
        if (!this.classesByMember.has(name)) this.classesByMember.set(name, []);
        this.classesByMember.get(name).push(cls);
      }
    }
  }

  /** The entry a type offers under a name, or null. */
  member(type, name) {
    if (!type) return null;
    if (type.kind === "f") return this.functions.get(name) ?? null;
    if (type.kind === "library") return this.libraries.get(type.name)?.get(name) ?? null;
    if (type.kind === "class") return this.classes.get(type.name)?.get(name) ?? null;
    return null;
  }

  /** The entry for a name on an object of unknown type: only if exactly one class has such a member (no guessing). */
  onlyMember(name) {
    const owners = this.classesByMember.get(name) ?? [];
    return owners.length === 1 ? this.classes.get(owners[0]).get(name) : null;
  }

  /**
   * The entry an attribute read offers under a name (BF-D-037): a property of a class, or a value of `f`. A library has
   * only functions, so `sound.something` read without a call has none. Null if there is none.
   */
  property(type, name) {
    if (type?.kind === "f") return this.values.get(name) ?? null;
    if (type?.kind !== "class") return null;
    const entry = this.classes.get(type.name)?.get(name);
    return entry?.raw.kind === "property" ? entry : null;
  }

  /** The property of an object of unknown type: only if exactly one class has a property of that name. */
  onlyProperty(name) {
    const owners = (this.classesByMember.get(name) ?? []).filter((cls) => this.property({ kind: "class", name: cls }, name));
    return owners.length === 1 ? this.property({ kind: "class", name: owners[0] }, name) : null;
  }

  /** What a call of this entry gives back (section 4): a list of X, a class, or null. */
  typeOfEntry(entry) {
    const raw = entry.raw;
    if (raw.element) return { kind: "list", of: raw.element };
    if (raw.kind === "class" && this.classes.has(raw.name)) return { kind: "class", name: raw.name };
    const returns = typeof raw.returns === "string" ? raw.returns.replace(/\s*\|\s*None$/, "") : null;
    return returns && this.classes.has(returns) ? { kind: "class", name: returns } : null;
  }

  isLibrary(name) {
    return this.libraries.has(name);
  }

  /** True if the catalogue says this parameter of an `f` function is a colour. */
  isColourParam(entry, param) {
    return entry.owner.kind === "f" && this.colourParams.has(`${entry.name}.${param}`);
  }

  /**
   * The callable entries a name list offers on this type, most used first, in groups:
   * {known, groups: [{title, entries}]}. Groups are the catalogue's sections; for an object of unknown type they are
   * the classes (section 4, step 3). A list is Python's own, so it is unknown here.
   * With `properties`, the list is what an attribute read offers (the properties of a class, the values of `f`) and not
   * what a call offers.
   */
  scope(type, { properties = false } = {}) {
    if (type && type.kind === "list") type = null;
    const key = `${properties ? "properties:" : ""}${type ? `${type.kind}:${type.name ?? ""}` : "unknown"}`;
    if (!this.scopes.has(key)) this.scopes.set(key, this.buildScope(type, properties));
    return this.scopes.get(key);
  }

  buildScope(type, properties) {
    const isValue = (entry) => entry.raw.kind === "property" || entry.raw.kind === "value";
    const callable = properties ? isValue : (entry) => !isValue(entry);
    if (!type) {
      const groups = [...this.classes].map(([cls, map]) => ({
        title: cls, entries: [...map.values()].filter(callable).sort(byRank),
      })).filter((g) => g.entries.length);
      return { known: false, groups };
    }
    const entries = type.kind === "f" ? [...(properties ? this.values : this.functions).values()]
      : type.kind === "library" ? [...(this.libraries.get(type.name)?.values() ?? [])]
        : [...(this.classes.get(type.name)?.values() ?? [])];
    // grouped by section, in the order of the first (most used) entry of each
    const groups = new Map();
    for (const entry of entries.filter(callable).sort(byRank)) {
      const title = entry.section || "More";
      if (!groups.has(title)) groups.set(title, []);
      groups.get(title).push(entry);
    }
    return { known: true, groups: [...groups].map(([title, list]) => ({ title, entries: list })) };
  }

  /**
   * The reference entry's address, or null. `helpBase` is an address the catalogue's relative url is read against, or a
   * function url -> address for a host that publishes the pages under other paths (MkDocs turns API.md into API/).
   */
  helpUrl(entry) {
    if (!this.helpBase || !entry?.url) return null;
    if (typeof this.helpBase === "function") return this.helpBase(entry.url) ?? null;
    try { return new URL(entry.url, this.helpBase).href; } catch (error) { return null; }
  }
}

/** Reads the catalogue once. A Catalogue already built is given back as it is. */
export function createCatalogue(raw, options) {
  return raw instanceof Catalogue ? raw : new Catalogue(raw, options);
}
