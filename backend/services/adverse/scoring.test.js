import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nameTokens,
  relevanceFor,
  classifyRisk,
  titleTone,
  judge,
} from "./scoring.js";

test("nameTokens drops legal suffixes and stopwords", () => {
  assert.deepEqual(nameTokens("Apple Inc"), ["apple"]);
  assert.deepEqual(nameTokens("Bank of America Corp"), ["bank", "america"]);
});

test("relevanceFor matches WHOLE tokens only (no substring false hits)", () => {
  // The substring bug let "ten" match "attention" → false relevance. Must be 0 now.
  assert.equal(relevanceFor(["ten"], "Global attention on markets"), 0);
  assert.equal(relevanceFor(["acme"], "Acme fined by regulator"), 1);
  assert.equal(relevanceFor(["bank", "america"], "Bank of America sued"), 1);
  assert.equal(relevanceFor([], "anything"), 0);
});

test("classifyRisk matches on word boundaries, not innocent substrings", () => {
  assert.equal(classifyRisk("there is an issue with delivery"), null); // not "sue"
  assert.equal(classifyRisk("everything is fine here"), null); // not bare "fine"
  assert.equal(classifyRisk("the SEC building downtown"), null); // bare "sec" removed
  assert.equal(classifyRisk("company fined by FCA"), "regulatory"); // "fined"
  assert.equal(classifyRisk("faces a major lawsuit"), "litigation");
  assert.equal(classifyRisk("filed for bankruptcy"), "insolvency");
  assert.equal(classifyRisk("accused of fraud"), "fraud");
});

test("titleTone is bounded and null-safe", () => {
  assert.equal(titleTone(""), null);
  const t = titleTone("fraud scandal collapse disaster");
  assert.ok(t <= 0 && t >= -10);
});

test("judge: needs negativity + risk category + relevance to flag adverse", () => {
  assert.equal(judge({ relevanceScore: 1, tone: -3, riskCategory: null }).isAdverse, false);
  assert.equal(judge({ relevanceScore: 1, tone: 2, riskCategory: "fraud" }).isAdverse, false);
  assert.equal(judge({ relevanceScore: 0.4, tone: -3, riskCategory: "fraud" }).isAdverse, false);
  assert.equal(judge({ relevanceScore: 1, tone: -3, riskCategory: "fraud" }).isAdverse, true);
});

test("judge: full multi-token match with clear negativity is high-confidence", () => {
  const v = judge({ relevanceScore: 1, tone: -3, riskCategory: "fraud", singleToken: false });
  assert.equal(v.isAdverse, true);
  assert.equal(v.borderline, false);
});

test("judge: single-token company name is always borderline (homonym risk)", () => {
  const v = judge({ relevanceScore: 1, tone: -3, riskCategory: "fraud", singleToken: true });
  assert.equal(v.isAdverse, true);
  assert.equal(v.borderline, true);
});

test("judge: a partial name match is borderline", () => {
  const v = judge({ relevanceScore: 0.5, tone: -3, riskCategory: "litigation" });
  assert.equal(v.borderline, true);
});
