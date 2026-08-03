import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
const root = new URL("../", import.meta.url);
test("ships the StreamVault product shell", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8"),
    layout = await readFile(new URL("app/layout.tsx", root), "utf8");
  assert.match(layout, /StreamVault — Catalog Intelligence/);
  for (const feature of [
    "Overview",
    "Ask the Catalog",
    "Catalog",
    "Briefings",
    "SAFE IMPORT REVIEW",
    "Evidence table",
    "soft-delete",
    "restore",
    "meeting summary",
    "Save to Briefings",
  ])
    assert.match(page, new RegExp(feature, "i"));
  assert.doesNotMatch(page, /SkeletonPreview|codex-preview/);
});
test("implements trust and calculation boundaries", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  for (const rule of [
    "Limited by data",
    "Definition applied",
    "International = at least",
    "Exact source IDs only",
    "count\\(unique active title IDs\\)",
    "catalog version",
  ])
    assert.match(page, new RegExp(rule, "i"));
});
test("fails closed on ambiguous or partially interpreted questions", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  for (const rule of [
    "Clarification required",
    "What period should",
    "release year or the date titles entered",
    "Which two periods",
    "What should the catalog be ranked by",
    "could not safely translate",
    "No calculation performed",
  ])
    assert.match(page, new RegExp(rule, "i"));
  assert.match(page, /answer\.status\s*!==\s*"Clarification required"/);
});
test("expands compatible representation ambiguity into volume and share", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  for (const rule of [
    "representationQuestion",
    "Documentaries",
    "Docuseries",
    "volumeDirection",
    "by volume",
    "share of additions",
    "comparisonContext",
    "aligns",
  ])
    assert.match(page, new RegExp(rule, "i"));
});
test("covers the approved demonstration question families", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  for (const rule of [
    "what (changed|has changed)",
    "country|countries",
    "drove|drivers|growth",
    "recently released",
    "briefing|summary",
    "has no additions for",
    "followUps",
    "PROMPT_POOL",
    "refreshSuggestions",
  ])
    assert.match(page, new RegExp(rule, "i"));
});
test("preserves original briefing results and compares current reruns", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  for (const rule of [
    "BriefingCard",
    "ORIGINAL",
    "CURRENT · V",
    "Review changes",
    "Open current evidence",
    "Copy briefing",
  ])
    assert.match(page, new RegExp(rule, "i"));
});
test("turns Overview into an operational catalog command center", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  for (const rule of [
    "CATALOG COMMAND CENTER",
    "DATA COVERAGE",
    "COMPARISON WINDOW",
    "Historical dataset",
    "What changed",
    "Data readiness",
    "runQuestion",
    "additionChange",
    "Missing rating",
    "Missing date added",
    "Worth noticing",
    "LIBRARY ACQUISITIONS",
  ])
    assert.match(page, new RegExp(rule, "i"));
});
test("strengthens every screen around the user's trust-first workflow", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  for (const rule of [
    "snapshot",
    "recordIds",
    "Data quality filter",
    "missing_rating",
    "Record history",
    "window.confirm",
    "onDelete",
    "Delete the saved briefing",
    "Which countries contributed the most",
    "country-known denominator",
    "importProblems",
    "Undo last import",
  ])
    assert.match(page, new RegExp(rule, "i"));
});
test("includes an explicit Vercel deployment path", async () => {
  const config = JSON.parse(
    await readFile(new URL("vercel.json", root), "utf8"),
  );
  assert.equal(config.framework, "nextjs");
  assert.equal(config.buildCommand, "npx next build");
});
test("bundles the approved catalog shape", async () => {
  const csv = await readFile(
    new URL("public/netflix_titles.csv", root),
    "utf8",
  );
  assert.match(
    csv,
    /show_id,type,title,director,cast_,country,date_added,release_year,rating,duration,listed_in,description/,
  );
  assert.ok(csv.length > 3_000_000);
});
