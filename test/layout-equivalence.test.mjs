// FA-33: layout records are one ordered list of regions. Every record compiles (with the rules of the FA-33 spec) to exactly
// the grid its 4.0.0 form had, so the geometry, and with it every drawing, is unchanged.
//
// The expected grids are test/fixtures/layouts-4.0.0.json, generated once from `git show v4.0.0:catalog/layouts/<id>.json`
// (areas, columns, rows and the regions map). The compile is test/layout-compile.mjs, a copy of core's FA-33 compile; this
// check moves to core's exported function once core publishes it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { readSnapshotKind } from "../scripts/catalog-snapshot.mjs";
import { bodyRegions } from "../scripts/fixtures.mjs";
import { ALL_KINDS, compileLayout, gridOf } from "./layout-compile.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const old = JSON.parse(readFileSync(path.join(root, "test", "fixtures", "layouts-4.0.0.json"), "utf8"));
const { records } = await readSnapshotKind(path.join(root, "catalog"), "layouts");
const RULE_ORDER = ["accepts", "role", "flow", "max", "bleed", "listColumns", "anchor", "empty"];

test("the fixture is the 28 gallery 4.0.0 layouts", () => {
  assert.deepEqual(records.map((record) => record.id), Object.keys(old));
  assert.equal(records.length, 28);
});

for (const record of records) {
  test(`${record.id}: the region list compiles to the 4.0.0 grid and rules`, () => {
    assert.deepEqual(compileLayout(record), gridOf(old[record.id]));
  });

  test(`${record.id}: the 4.0.0 grid keys are gone, and reading order is the old region order`, () => {
    for (const key of ["areas", "columns", "rows"]) assert.equal(key in record, false, `${record.id} still has ${key}`);
    assert.ok(Array.isArray(record.regions), "regions is the ordered array");
    assert.ok(["row", "column"].includes(record.direction), "the direction is written");
    assert.deepEqual(bodyRegions(record).map(([name]) => name), Object.keys(old[record.id].regions), "fixture decks keep their block order");
    const walk = (list, depth) => {
      assert.ok(depth <= 3 && list.length >= 1 && list.length <= 12);
      for (const entry of list) if (entry.regions) walk(entry.regions, depth + 1);
    };
    walk(record.regions, 1);
  });
}

test("rules are kept exactly: nothing but `accepts` is inherited or dropped, and `accepts` is never the full set", () => {
  for (const record of records) {
    const before = old[record.id].regions;
    const compiled = compileLayout(record).regions;
    for (const [name, rule] of Object.entries(before)) {
      for (const key of RULE_ORDER) assert.deepEqual(compiled[name][key], rule[key], `${record.id}/${name}.${key}`);
    }
    const written = (list) => list.flatMap((entry) => (entry.regions ? written(entry.regions) : [entry]));
    for (const entry of written(record.regions)) {
      if (entry.name === "title" || entry.name === "subtitle") assert.deepEqual(Object.keys(entry).filter((key) => key !== "name" && key !== "size"), [], `${record.id}/${entry.name}: a heading takes only size`);
      else assert.ok(entry.accepts && entry.accepts.length < ALL_KINDS.length, `${record.id}/${entry.name} has no reason to omit accepts`);
    }
  }
});

test("an anchor is written once at the record when every body region shares it, and the records that nest are the seven known", () => {
  assert.deepEqual(records.filter((record) => record.anchor).map((record) => [record.id, record.anchor]), [["statement", "middle"], ["quote", "middle"]]);
  for (const record of records.filter((entry) => entry.anchor)) assert.ok(bodyRegions(record).every(([, rule]) => rule.anchor === "middle"));
  const nested = records.filter((record) => JSON.stringify(record.regions).includes('"direction"')).map((record) => record.id);
  // Five nest only because the title stays an explicit heading region above a row of two; comparison and hero are 2D beyond it.
  assert.deepEqual(nested.sort(), ["chart-beside", "code", "comparison", "hero", "image-beside", "table-beside", "two-column"]);
});

test("the compile rejects a tree the spec forbids", () => {
  assert.throws(() => compileLayout({ direction: "row", regions: [{ name: "a", size: "auto" }] }), /opf\/layout-template/);
  assert.throws(() => compileLayout({ direction: "column", regions: [{ name: "a" }, { name: "a" }] }), /duplicate/);
  assert.deepEqual(compileLayout({ direction: "column", anchor: "middle", regions: [{ name: "a", anchor: "top", accepts: ["text"] }, { name: "b" }] }).regions, {
    a: { accepts: ["text"], anchor: "top" },
    b: { accepts: ALL_KINDS, anchor: "middle" },
  });
});
