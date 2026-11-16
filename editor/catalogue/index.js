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
//   {kind: "python", name}  an object of Python's own type (BF-D-044): name is "str", "int", "float", "list", "dict", ...
//
// The second source is Python's own catalogue (python.json, made by tools/make_python_catalogue.py): the built-in
// functions, for a bare call (BF-D-040), and the methods of Python's main types. blockly-fun keeps that file; the host
// gives funground's only. A bare call of an imported name is that import's; any other bare name is Python's own.

import { parseSignature } from "./slots.js";
import pythonData from "./python.json" with { type: "json" };

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
  constructor(raw, { helpBase = null, python = pythonData } = {}) {
    this.raw = raw;
    this.helpBase = helpBase;
    this.functions = new Map();              // names of f: a call or a class
    this.values = new Map();                 // names of f that are values (width, key, mouse_x), read as attributes
    this.libraries = new Map();              // library name -> Map name -> Entry
    this.classes = new Map();                // class name -> Map name -> Entry (methods and properties)
    this.classesByMember = new Map();        // member name -> [class names], for an object of unknown class
    this.colourParams = new Set((raw.color_params || []).map((c) => `${c.function}.${c.parameter}`));
    this.scopes = new Map();                 // scope key -> groups, built on first use
    this.pythonNames = new Map();            // Python's built-in functions: name -> Entry
    this.pythonClasses = new Map();          // Python's types: name -> Map name -> Entry (methods)
    this.stdlib = new Set(python?.stdlib ?? []);

    const owner = { kind: "f" };
    for (const item of raw.names || []) {
      if (PLAIN_KINDS.has(item.kind)) this.functions.set(item.name, new Entry(item, owner));
      else if (item.kind === "value") this.values.set(item.name, new Entry(item, owner));
    }
    const builtin = { kind: "python" };
    for (const item of python?.names ?? []) this.pythonNames.set(item.name, new Entry(item, builtin));
    for (const [cls, body] of Object.entries(python?.classes ?? {})) {
      const map = new Map();
      for (const item of body.members) map.set(item.name, new Entry(item, { kind: "python", name: cls }));
      this.pythonClasses.set(cls, map);
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
    if (type.kind === "python") return this.pythonClasses.get(type.name)?.get(name) ?? null;
    if (type.kind === "list") return this.pythonClasses.get("list")?.get(name) ?? null;   // a list is Python's own
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
    if (entry.owner.kind === "python") {
      const returns = /^\w+/.exec(raw.returns ?? "")?.[0];
      return returns && this.pythonClasses.has(returns) ? { kind: "python", name: returns } : null;
    }
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
    if (type?.kind === "list") type = { kind: "python", name: "list" };   // a list is Python's own
    const key = `${properties ? "properties:" : ""}${type ? `${type.kind}:${type.name ?? ""}` : "unknown"}`;
    if (!this.scopes.has(key)) this.scopes.set(key, this.buildScope(type, properties));
    return this.scopes.get(key);
  }

  buildScope(type, properties) {
    // not known: the note alone. A list of every class's members does not make sense (BF-D-044).
    // Python's types have no properties to list, so an attribute read on one has nothing to offer either.
    if (!type || (type.kind === "python" && properties)) return { known: false, groups: [] };
    const isValue = (entry) => entry.raw.kind === "property" || entry.raw.kind === "value";
    const callable = properties ? isValue : (entry) => !isValue(entry);
    if (type.kind === "python") {
      const entries = [...(this.pythonClasses.get(type.name)?.values() ?? [])].sort(byRank);
      return { known: true, groups: entries.length ? [{ title: type.name, entries }] : [] };
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

  // -- a bare call, `name(...)` (BF-D-040) -------------------------------------------------------------------------

  /**
   * The entries the sketch's imports give as bare names: Map name -> Entry. `imports` is what imports.js reads:
   * [{module, name, alias}]. A funground name has funground's entry; any other has its name alone, with Help to
   * docs.python.org when the module is in the standard library. A funground library (`sound`) is used with a dot, so
   * it is not here.
   */
  importedEntries(imports) {
    const found = new Map();
    for (const { module, name, alias } of imports) {
      if (module === "funground") {
        if (name === "*") for (const entry of this.functions.values()) found.set(entry.name, entry);
        else if (this.functions.has(name)) {
          const entry = this.functions.get(name);
          found.set(alias, alias === name ? entry : new Entry({ ...entry.raw, name: alias }, entry.owner));
        }
      } else if (name !== "*") {
        found.set(alias, this.importedEntry(module, name, alias));
      }
    }
    return found;
  }

  importedEntry(module, name, alias) {
    const raw = { name: alias, kind: "function", summary: "", plain: `From ${module}.` };
    if (this.stdlib.has(module.split(".")[0])) raw.url = `https://docs.python.org/3/library/${module}.html#${module}.${name}`;
    return new Entry(raw, { kind: "python", module });
  }

  /** The entry a bare name stands for: an imported name first, then Python's own function. Null if neither. */
  bareEntry(name, imports = []) {
    return this.importedEntries(imports).get(name) ?? this.pythonNames.get(name) ?? null;
  }

  /** The list of a bare call: "In your sketch" (the imported names), then "Python's own". */
  bareScope(imports = []) {
    const imported = [...this.importedEntries(imports).values()].sort(byRank);
    const own = [...this.pythonNames.values()].sort(byRank).filter((e) => !imported.some((i) => i.name === e.name));
    const groups = [];
    if (imported.length) groups.push({ title: "In your sketch", entries: imported });
    if (own.length) groups.push({ title: "Python's own", entries: own });
    return { known: true, groups };
  }

  /**
   * The reference entry's address, or null. `helpBase` is an address the catalogue's relative url is read against, or a
   * function url -> address for a host that publishes the pages under other paths (MkDocs turns API.md into API/).
   */
  helpUrl(entry) {
    if (/^https?:\/\//.test(entry?.url ?? "")) return entry.url;   // an address of its own (docs.python.org)
    if (!this.helpBase || !entry?.url) return null;
    if (typeof this.helpBase === "function") return this.helpBase(entry.url) ?? null;
    try { return new URL(entry.url, this.helpBase).href; } catch (error) { return null; }
  }
}

/** Reads the catalogue once. A Catalogue already built is given back as it is. */
export function createCatalogue(raw, options) {
  return raw instanceof Catalogue ? raw : new Catalogue(raw, options);
}
