import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeName,
  significantTokens,
  similarity,
  resolve,
} from "./index.js";

test("normalizeName strips legal suffixes and punctuation", () => {
  assert.equal(normalizeName("Acme Holdings Ltd."), "acme");
  assert.equal(normalizeName("Tesco PLC"), "tesco");
  assert.equal(normalizeName("A&B Corp"), "a and b");
  assert.equal(normalizeName(""), "");
  assert.equal(normalizeName(null), "");
});

test("significantTokens drops suffixes and single chars", () => {
  assert.deepEqual(significantTokens("Acme Group International"), ["acme"]);
  assert.deepEqual(significantTokens("J P Morgan Co"), ["morgan"]);
});

test("similarity: identical normalized names score 1, unrelated low", () => {
  assert.equal(similarity("Apple Inc", "Apple Incorporated"), 1);
  assert.ok(similarity("Tesco PLC", "Sainsbury PLC") < 0.6);
  assert.equal(similarity("", "Acme"), 0);
});

test("resolve: strong key (companyNumber) merges despite different names", () => {
  const { canonical, matchedSources, matchCoveragePct } = resolve("Acme", {
    gleif: [{ source: "gleif", name: "ACME CORP", companyNumber: "00445790", jurisdiction: "GB", lei: "L1" }],
    companies_house: [{ source: "companies_house", name: "ACME LIMITED", companyNumber: "00445790", jurisdiction: "GB" }],
  });
  assert.equal(canonical.companyNumber, "00445790");
  assert.equal(canonical.lei, "L1");
  assert.deepEqual(matchedSources.sort(), ["companies_house", "gleif"]);
  assert.equal(matchCoveragePct, 100); // 2 of 2 queried sources matched
});

test("resolve: different known jurisdictions are NOT merged on name alone", () => {
  const { matchedSources } = resolve("Acme", {
    gleif: [{ source: "gleif", name: "ACME", jurisdiction: "US", lei: "L1" }],
    companies_house: [{ source: "companies_house", name: "ACME", jurisdiction: "GB", companyNumber: "C1" }],
  });
  assert.equal(matchedSources.length, 1); // jurisdiction veto blocks the false merge
});

test("resolve: a single-source hit out of several queried is NOT 100% coverage", () => {
  const { matchCoveragePct, matchedSources } = resolve("Tesco", {
    gleif: [{ source: "gleif", name: "TESCO PLC", lei: "L1", jurisdiction: "GB" }],
    companies_house: [],
    sec: [],
  });
  assert.equal(matchedSources.length, 1);
  assert.equal(matchCoveragePct, 33); // 1 of 3 queried sources (was 100% before the fix)
});

test("resolve: no candidates anywhere returns null canonical", () => {
  const { canonical, matchCoveragePct } = resolve("Nothing", { gleif: [], sec: [] });
  assert.equal(canonical, null);
  assert.equal(matchCoveragePct, 0);
});
