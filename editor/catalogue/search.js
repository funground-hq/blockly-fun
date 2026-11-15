// The order of matches in a name list (Funground_Calls_Note.md, section 5). Each tier is sorted by rank, then name:
//   1. the start of the name       "tex" finds text, text_size, text_align
//   2. a word inside the name      "align" finds text_align
//   3. the `also` words            "transparent" finds opacity
//   4. the summary and the plain sentence

const byRank = (a, b) => b.rank - a.rank || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

/** The tier (1 to 4) an entry matches a lower-case query in, or 0 for no match. */
export function tierOf(entry, query) {
  if (entry.lowerName.startsWith(query)) return 1;
  if (entry.words.some((w, i) => i > 0 && w.startsWith(query))) return 2;
  if (entry.also.some((w) => w.includes(query))) return 3;
  if (entry.text.includes(query)) return 4;
  return 0;
}

/** The entries of a list that match, best tier first. An empty query matches all, in the list's own order. */
export function searchEntries(entries, query) {
  const q = query.trim().toLowerCase();
  if (q === "") return entries;
  const tiers = [[], [], [], []];
  for (const entry of entries) {
    const tier = tierOf(entry, q);
    if (tier) tiers[tier - 1].push(entry);
  }
  return tiers.flatMap((list) => list.sort(byRank));
}

/**
 * What a name list shows: groups of entries.
 *   scope   catalogue.scope(type)
 *   query   the text typed so far (empty: grouped by section, or by class for an unknown object)
 *   name    the name now in the field: for an unknown object, classes with a member of that name come first
 * With a query, a known scope gives one flat group (no heading); an unknown scope keeps its groups, since the
 * class is what the learner has to choose.
 */
export function searchScope(scope, query, name = "") {
  const q = query.trim();
  let groups = scope.groups;
  if (!scope.known) {
    const has = (g) => g.entries.some((e) => e.name === name);
    groups = [...groups.filter(has), ...groups.filter((g) => !has(g))];
  }
  if (q === "") return groups;
  if (!scope.known) {
    return groups.map((g) => ({ title: g.title, entries: searchEntries(g.entries, q) })).filter((g) => g.entries.length);
  }
  const all = groups.flatMap((g) => g.entries);
  const found = searchEntries(all, q);
  return found.length ? [{ title: null, entries: found }] : [];
}
