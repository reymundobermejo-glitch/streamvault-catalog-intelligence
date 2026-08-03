import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const csv = await readFile(new URL("public/netflix_titles.csv", root), "utf8");

function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); if (row.some(Boolean)) rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift();
  return rows.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] || ""])));
}

const rows = parseCSV(csv);
const months = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
function date(value) {
  value = value.trim();
  let match = value.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (match) return new Date(Date.UTC(2000 + +match[3], months[match[2]], +match[1]));
  match = value.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (match) return new Date(Date.UTC(+match[3], months[match[1].slice(0, 3)], +match[2]));
  return null;
}
function isDocumentary(row) {
  return row.listed_in.split(",").some((label) => ["Documentaries", "Docuseries"].includes(label.trim()));
}
function ytd(year) {
  return rows.filter((row) => {
    const d = date(row.date_added);
    return d && d.getUTCFullYear() === year && (d.getUTCMonth() < 8 || (d.getUTCMonth() === 8 && d.getUTCDate() <= 25));
  });
}

test("uses aligned periods for the historical source cutoff", () => {
  const prior = ytd(2020), current = ytd(2021);
  assert.equal(prior.length, 1363);
  assert.equal(current.length, 1498);
  assert.equal(prior.filter(isDocumentary).length, 140);
  assert.equal(current.filter(isDocumentary).length, 170);
  assert.ok(current.filter(isDocumentary).length > prior.filter(isDocumentary).length);
});

test("keeps country unknowns visible in the current comparable period", () => {
  const priorUnknown = ytd(2020).filter((row) => !row.country).length;
  const currentUnknown = ytd(2021).filter((row) => !row.country).length;
  assert.equal(priorUnknown, 83);
  assert.equal(currentUnknown, 358);
  assert.ok(currentUnknown / ytd(2021).length > 0.2);
});

test("identifies source defects import review must block", () => {
  assert.equal(rows.filter((row) => /^\d+ min$/i.test(row.rating)).length, 3);
  const groups = new Map();
  rows.forEach((row) => {
    const key = `${row.title.trim().toLowerCase()}|${row.type}|${row.release_year}`;
    groups.set(key, [...(groups.get(key) || []), row]);
  });
  assert.equal([...groups.values()].filter((group) => group.length > 1).length, 7);
});
