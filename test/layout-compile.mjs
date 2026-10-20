// The FA-33 compile, as SPEC.md describes it: a layout record's ordered `regions` tree becomes the grid the engine uses
// (areas, column weights, row weights or "auto", and region rules). This copy exists so the gallery can prove its
// conversion before core publishes the function; once core exports it, the equivalence test moves to core's function and
// this file goes.
//
// Every tree is a guillotine partition, so the compile is exact: collect the cut positions along each axis to form the
// grid's columns and rows, then fill each region's rectangle with its name. Weights are exact fractions, never floats.

const gcd = (a, b) => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const frac = (n, d = 1) => {
  if (!Number.isInteger(n) || !Number.isInteger(d)) throw new Error(`size ${n}/${d} is not an integer ratio`);
  const g = gcd(n, d) || 1;
  return { n: n / g, d: d / g };
};
const add = (a, b) => frac(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a, b) => frac(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => frac(a.n * b.n, a.d * b.d);
const div = (a, b) => frac(a.n * b.d, a.d * b.n);
const cmp = (a, b) => a.n * b.d - b.n * a.d;
const ZERO = frac(0);
const ONE = frac(1);
const text = (value) => (value === "auto" ? "auto" : `${value.n}/${value.d}`);

/** The content kinds a region takes when `accepts` is omitted (SPEC.md): every body kind plus `group`. */
export const ALL_KINDS = ["text", "list", "image", "video", "chart", "table", "code", "metric", "quote", "timeline", "group"];

const isSplit = (entry) => Array.isArray(entry.regions);
const isHeading = (entry) => entry.name === "title" || entry.name === "subtitle";

/** The cut positions (fractions of 1) of a list of weights; weights sum to 1. */
const cuts = (weights) => {
  const out = [ZERO];
  for (const weight of weights) out.push(add(out.at(-1), weight));
  return out;
};
const normalize = (weights) => {
  const numeric = weights.filter((weight) => weight !== "auto");
  const total = numeric.reduce((sum, weight) => add(sum, weight), ZERO);
  return weights.map((weight) => (weight === "auto" ? weight : div(weight, total)));
};

/** Compiles `{ direction, regions }` (the record, or a split) to { areas, columns, rows } with exact fractions. */
function compileList(direction, entries, anchor, rules, seen) {
  const kids = entries.map((entry) => {
    const own = entry.anchor ?? anchor;
    const defaultSize = isHeading(entry) && direction === "column" ? "auto" : 1;
    const size = entry.size ?? defaultSize;
    if (size === "auto" && (direction !== "column" || isSplit(entry))) throw new Error(`"auto" size on ${entry.name ?? "a split"} (opf/layout-template)`);
    const weight = size === "auto" ? size : frac(size);
    if (isSplit(entry)) return { weight, grid: compileList(entry.direction, entry.regions, own, rules, seen) };
    if (seen.has(entry.name)) throw new Error(`duplicate region name ${entry.name}`);
    seen.add(entry.name);
    if (!isHeading(entry)) {
      const { name, size: _size, ...own_rules } = entry;
      const resolved = { ...own_rules };
      if (resolved.accepts === undefined) resolved.accepts = [...ALL_KINDS];
      if (own !== undefined && resolved.anchor === undefined) resolved.anchor = own;
      rules[name] = resolved;
    }
    return { weight, grid: { areas: [[entry.name]], columns: [ONE], rows: [ONE] } };
  });
  if (direction === "column") {
    const total = kids.reduce((sum, kid) => (kid.weight === "auto" ? sum : add(sum, kid.weight)), ZERO);
    // Columns: the common refinement of every child's column cuts.
    const positions = [];
    for (const { grid } of kids) for (const at of cuts(grid.columns)) if (!positions.some((p) => cmp(p, at) === 0)) positions.push(at);
    positions.sort(cmp);
    const columns = positions.slice(1).map((at, i) => sub(at, positions[i]));
    const areas = [];
    const rows = [];
    for (const { weight, grid } of kids) {
      const edges = cuts(grid.columns);
      const pick = (from) => edges.findIndex((edge, i) => i < edges.length - 1 && cmp(edge, from) <= 0 && cmp(from, edges[i + 1]) < 0);
      const expanded = grid.areas.map((row) => positions.slice(0, -1).map((from) => row[pick(from)]));
      areas.push(...expanded);
      if (weight === "auto") {
        if (grid.rows.length !== 1) throw new Error('"auto" on a nested grid');
        rows.push("auto");
      } else {
        for (const row of grid.rows) rows.push(row === "auto" ? row : mul(div(weight, total), row));
      }
    }
    return { areas, columns, rows };
  }
  const total = kids.reduce((sum, kid) => add(sum, kid.weight), ZERO);
  const positions = [];
  for (const { grid } of kids) {
    if (grid.rows.includes("auto")) throw new Error('"auto" rows beside siblings');
    for (const at of cuts(grid.rows)) if (!positions.some((p) => cmp(p, at) === 0)) positions.push(at);
  }
  positions.sort(cmp);
  const rows = positions.slice(1).map((at, i) => sub(at, positions[i]));
  const columns = [];
  const parts = [];
  for (const { weight, grid } of kids) {
    const share = div(weight, total);
    for (const column of grid.columns) columns.push(mul(share, column));
    const edges = cuts(grid.rows);
    const pick = (from) => edges.findIndex((edge, i) => i < edges.length - 1 && cmp(edge, from) <= 0 && cmp(from, edges[i + 1]) < 0);
    parts.push(positions.slice(0, -1).map((from) => grid.areas[pick(from)]));
  }
  const areas = rows.map((_, r) => parts.flatMap((part) => part[r]));
  return { areas, columns, rows };
}

/**
 * The grid a layout record compiles to: `areas`, `columns` and `rows` (weights as exact "n/d" strings, normalized to sum 1;
 * "auto" rows stay "auto", the numeric rows sum to 1) and `regions` (name -> rules, `anchor` inherited from the record or
 * split, `accepts` defaulted to every kind).
 */
export function compileLayout(record) {
  const rules = {};
  const grid = compileList(record.direction ?? "column", record.regions, record.anchor, rules, new Set());
  return {
    areas: grid.areas,
    columns: normalize(grid.columns).map(text),
    rows: normalize(grid.rows).map(text),
    regions: rules,
  };
}

/** A 4.0.0 record's grid in the same terms: weights normalized to exact fractions; `accepts` as a sorted set. */
export function gridOf({ areas, columns, rows, regions }) {
  const sorted = Object.fromEntries(
    Object.entries(regions).map(([name, rule]) => [name, { ...rule, accepts: [...rule.accepts] }]),
  );
  return {
    areas,
    columns: normalize((columns ?? areas[0].map(() => 1)).map((weight) => frac(weight))).map(text),
    rows: normalize((rows ?? areas.map(() => 1)).map((weight) => (weight === "auto" ? weight : frac(weight)))).map(text),
    regions: sorted,
  };
}
