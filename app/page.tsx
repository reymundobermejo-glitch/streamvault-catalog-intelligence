"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

type Title = {
  show_id: string;
  type: string;
  title: string;
  director: string;
  cast: string;
  country: string;
  date_added: string;
  release_year: string;
  rating: string;
  duration: string;
  listed_in: string;
  description: string;
  status?: "active" | "deleted";
  updated_at?: string;
};
type History = {
  id: string;
  action: string;
  title: string;
  detail: string;
  at: string;
};
type Saved = {
  id: string;
  question: string;
  answer: string;
  at: string;
  version: number;
  engineVersion?: string;
  snapshot?: Omit<Answer, "rows" | "evidenceGroups"> & {
    recordIds: string[];
    evidenceGroups?: { label: string; recordIds: string[] }[];
  };
};
type Answer = {
  status: string;
  headline: string;
  numbers: string;
  scope: string;
  calculation: string;
  definition?: string;
  limitation?: string;
  rows: Title[];
  evidenceGroups?: { label: string; rows: Title[] }[];
  clarifications?: { label: string; query: string }[];
};
const EMPTY: Title = {
  show_id: "",
  type: "Movie",
  title: "",
  director: "",
  cast: "",
  country: "",
  date_added: "",
  release_year: "",
  rating: "",
  duration: "",
  listed_in: "",
  description: "",
  status: "active",
};
const PROMPT_POOL = [
  "Are we light on documentaries compared to last year?",
  "What changed in the catalog this year?",
  "Which countries drove growth in TV shows?",
  "Show recently released horror titles.",
  "Prepare a briefing on 2026 catalog additions.",
  "Compare movie additions in 2020 and 2021.",
  "Which genres have the lowest representation?",
  "What percentage of 2020 additions were international?",
  "Which records are missing country information?",
  "Break the catalog down by rating.",
  "Which countries contributed the most movies?",
  "Show documentaries added in 2021.",
];
const ENGINE_VERSION = "2.0";

function parseCSV(text: string) {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (q && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else q = !q;
    } else if (c === "," && !q) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !q) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const headers = rows.shift() || [];
  return rows.map(
    (r) =>
      Object.fromEntries(
        headers.map((h, i) => [h === "cast_" ? "cast" : h, r[i] || ""]),
      ) as Title,
  );
}
const split = (v: string) =>
  v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
const MONTHS: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};
/** Parse the two source date formats without relying on browser locale rules. */
const catalogDate = (value: string) => {
  const v = value.trim();
  let m = v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{2})$/);
  if (m) {
    const month = MONTHS[m[2].toLowerCase()];
    const year = 2000 + Number(m[3]);
    if (month !== undefined) return new Date(Date.UTC(year, month, Number(m[1])));
  }
  m = v.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (month !== undefined) return new Date(Date.UTC(Number(m[3]), month, Number(m[2])));
  }
  return null;
};
const dateKey = (date: Date) => `${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
const formatCatalogDate = (date: Date, withYear = true) =>
  date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
const GENRES = [
  {
    key: "documentary",
    label: "documentary",
    terms: ["documentaries", "docuseries"],
  },
  { key: "comedy", label: "comedy", terms: ["comed"] },
  { key: "drama", label: "drama", terms: ["drama"] },
  { key: "children", label: "children’s", terms: ["children"] },
  { key: "horror", label: "horror", terms: ["horror"] },
  { key: "romantic", label: "romantic", terms: ["romantic"] },
  { key: "action", label: "action", terms: ["action"] },
  { key: "anime", label: "anime", terms: ["anime"] },
  { key: "sci-fi", label: "sci-fi", terms: ["sci-fi"] },
  { key: "thriller", label: "thriller", terms: ["thriller"] },
];
const askedGenre = (q: string) =>
  GENRES.find((g) => q.includes(g.key) || g.terms.some((t) => q.includes(t)));
const genreMatch = (r: Title, g: (typeof GENRES)[number]) =>
  g.terms.some((t) => r.listed_in.toLowerCase().includes(t));
const yearAdded = (r: Title) => {
  const d = catalogDate(r.date_added);
  return d ? d.getUTCFullYear() : null;
};
const active = (rows: Title[]) => rows.filter((r) => r.status !== "deleted");
const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);
const csvEscape = (v: string) => `"${String(v ?? "").replaceAll('"', '""')}"`;

function comparisonContext(rows: Title[]) {
  const dated = rows
    .map((r) => ({ r, date: catalogDate(r.date_added) }))
    .filter((x): x is { r: Title; date: Date } => Boolean(x.date));
  const latestDate = dated.reduce(
    (latest, x) => (x.date > latest ? x.date : latest),
    dated[0]?.date || new Date(0),
  );
  const currentYear = latestDate.getUTCFullYear();
  const endKey = dateKey(latestDate);
  const current = dated.filter(
    (x) => x.date.getUTCFullYear() === currentYear && dateKey(x.date) <= endKey,
  ).map((x) => x.r);
  const previous = dated.filter(
    (x) => x.date.getUTCFullYear() === currentYear - 1 && dateKey(x.date) <= endKey,
  ).map((x) => x.r);
  const partial = endKey !== "12-31";
  return {
    currentYear,
    previousYear: currentYear - 1,
    latestDate,
    current,
    previous,
    partial,
    label: partial
      ? `Jan 1–${formatCatalogDate(latestDate, false)}`
      : "full year",
  };
}

function countryCoverage(rows: Title[]) {
  const unknown = rows.filter((r) => !r.country.trim()).length;
  return { unknown, known: rows.length - unknown, rate: rows.length ? unknown / rows.length : 0 };
}

function importProblems(r: Title) {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (!r.show_id || !r.title || !r.type || !r.release_year || !r.date_added || !r.listed_in)
    blocking.push("required field missing");
  if (!["Movie", "TV Show"].includes(r.type)) blocking.push("invalid type");
  if (!/^\d{4}$/.test(r.release_year) || +r.release_year < 1888 || +r.release_year > 2100)
    blocking.push("invalid release year");
  if (r.date_added && !catalogDate(r.date_added)) blocking.push("unreadable date");
  if (/^\d+ min$/i.test(r.rating.trim())) blocking.push("duration placed in rating");
  if (r.duration && r.type === "Movie" && !/^\d+ min$/i.test(r.duration.trim())) warnings.push("movie duration is unusual");
  if (r.duration && r.type === "TV Show" && !/^\d+ Seasons?$/i.test(r.duration.trim())) warnings.push("TV duration is unusual");
  if (!r.country.trim()) warnings.push("country unknown");
  return { blocking, warnings };
}

function analyze(question: string, rows: Title[]): Answer {
  const q = question.toLowerCase().trim(),
    data = active(rows);
  const yearMatches = [...q.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => +m[0]);
  if (!q)
    return clarify(
      "Ask a catalog question to begin.",
      "No filters or calculations were applied.",
      [],
    );
  if (
    /watch time|audience|popular|best|successful|prefer|profit|licens|acquire next|performance|demand/.test(
      q,
    )
  )
    return {
      status: "Limited by data",
      headline: "The catalog cannot support that conclusion.",
      numbers: "No performance, audience, cost, or demand fields are present.",
      scope: `${fmt(data.length)} active catalog records examined · catalog version ${versionOf(rows)}`,
      calculation: "No calculation performed",
      limitation:
        "Add performance, audience, cost, or strategy data to answer this responsibly.",
      rows: [],
    };
  const latestRelease = Math.max(...data.map((r) => +r.release_year || 0)),
    latestAdded = Math.max(...data.map((r) => yearAdded(r) || 0));
  const requestedGenre = askedGenre(q);
  const representationQuestion =
    /\b(light|lighter|strong|stronger|weak|weaker|underrepresented|representation)\b/.test(
      q,
    ) && /\b(compare|compared|than|last year|year over year)\b/.test(q);
  if (representationQuestion && requestedGenre) {
    const period = comparisonContext(data),
      current = period.currentYear,
      previous = period.previousYear;
    const currentAll = period.current,
      previousAll = period.previous,
      currentCategory = currentAll.filter((r) => genreMatch(r, requestedGenre)),
      previousCategory = previousAll.filter((r) =>
        genreMatch(r, requestedGenre),
      );
    const countChange = previousCategory.length
        ? ((currentCategory.length - previousCategory.length) /
            previousCategory.length) *
          100
        : 0,
      currentShare = currentAll.length
        ? (currentCategory.length / currentAll.length) * 100
        : 0,
      previousShare = previousAll.length
        ? (previousCategory.length / previousAll.length) * 100
        : 0,
      shareChange = currentShare - previousShare;
    const volumeDirection = countChange < 0 ? "lighter" : "stronger",
      shareDirection = shareChange < 0 ? "weaker" : "stronger";
    return {
      status: "Definition applied",
      headline: `${requestedGenre.label[0].toUpperCase() + requestedGenre.label.slice(1)} was ${volumeDirection} by volume but ${shareDirection} as a share of additions.`,
      numbers: `Volume: ${fmt(previousCategory.length)} in ${previous} → ${fmt(currentCategory.length)} in ${current} (${countChange >= 0 ? "+" : ""}${countChange.toFixed(1)}%). Share: ${previousShare.toFixed(1)}% → ${currentShare.toFixed(1)}% (${shareChange >= 0 ? "+" : ""}${shareChange.toFixed(1)} percentage points).`,
      scope: `Active titles classified as ${requestedGenre.label} · date added in ${previous} and ${current} · ${fmt(previousAll.length + currentAll.length)} total additions examined`,
      calculation: `Volume change = (${currentCategory.length} − ${previousCategory.length}) ÷ ${previousCategory.length} × 100; share = category additions ÷ all additions in each year × 100`,
      definition: `“Light” is evaluated using both title volume and share of all catalog additions. ${period.partial ? `The comparison aligns ${period.label} in ${previous} and ${current}.` : `The comparison uses full years ${previous} and ${current}.`}`,
      limitation: `This is a snapshot of titles present in the source extract, not a complete historical acquisition ledger. Multi-genre titles count once when ${requestedGenre.label} is present.`,
      rows: [...currentCategory, ...previousCategory],
      evidenceGroups: [
        { label: `${current} · ${period.label} · ${requestedGenre.label}`, rows: currentCategory },
        { label: `${previous} · ${period.label} · ${requestedGenre.label}`, rows: previousCategory },
      ],
    };
  }
  if (
    /\bwhat (changed|has changed)\b/.test(q) &&
    /\b(this year|year over year|last year)\b/.test(q)
  ) {
    const period = comparisonContext(data),
      current = period.currentYear,
      previous = period.previousYear,
      cur = period.current,
      prev = period.previous,
      delta = cur.length - prev.length,
      pct = prev.length ? (delta / prev.length) * 100 : 0,
      curTV = cur.filter((r) => r.type === "TV Show").length,
      prevTV = prev.filter((r) => r.type === "TV Show").length;
    return {
      status: "Definition applied",
      headline: `Catalog additions ${delta >= 0 ? "increased" : "decreased"} by ${Math.abs(pct).toFixed(1)}% in the latest available year.`,
      numbers: `Total additions: ${fmt(prev.length)} in ${previous} → ${fmt(cur.length)} in ${current}. TV shows: ${fmt(prevTV)} → ${fmt(curTV)}; movies: ${fmt(prev.length - prevTV)} → ${fmt(cur.length - curTV)}.`,
      scope: `All active titles added in ${previous} and ${current}`,
      calculation: `(${cur.length} − ${prev.length}) ÷ ${prev.length} × 100`,
      definition: period.partial
        ? `“This year” uses the observed period ${period.label} in ${current}, aligned with the same dates in ${previous}.`
        : `“This year” compares full catalog years ${current} and ${previous}.`,
      limitation: "Counts describe titles retained in this catalog snapshot by date added; removals are not available.",
      rows: cur,
    };
  }
  if (
    /\b(country|countries)\b/.test(q) &&
    /\b(drove|drivers|growth|increase)\b/.test(q)
  ) {
    const period = comparisonContext(data),
      current = period.currentYear,
      previous = period.previousYear;
    let cur = period.current,
      prev = period.previous;
    if (/tv show|tv shows|series/.test(q)) {
      cur = cur.filter((r) => r.type === "TV Show");
      prev = prev.filter((r) => r.type === "TV Show");
    }
    const counts = (rs: Title[]) => {
        const m = new Map<string, number>();
        rs.forEach((r) =>
          split(r.country).forEach((c) => m.set(c, (m.get(c) || 0) + 1)),
        );
        return m;
      },
      cm = counts(cur),
      pm = counts(prev),
      drivers = [...cm]
        .map(
          ([country, count]) =>
            [country, count - (pm.get(country) || 0)] as [string, number],
        )
        .filter((x) => x[1] > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5),
      driverNames = new Set(drivers.map((x) => x[0]));
    return {
      status: "Definition applied",
      headline: `${drivers[0]?.[0] || "No country"} was the largest positive country driver in the latest available comparison.`,
      numbers: drivers.length
        ? drivers.map(([c, d]) => `${c}: +${d}`).join(" · ")
        : "No country recorded positive association growth.",
      scope: `${/tv show|tv shows|series/.test(q) ? "TV shows" : "All titles"} added in ${previous} and ${current}`,
      calculation:
        "country associations in current period − country associations in previous period; rank positive differences",
      definition: `“Growth” compares aligned ${period.label} periods in ${previous} and ${current}. Country associations can overlap for multinational titles.`,
      limitation: (() => {
        const coverage = countryCoverage(cur);
        return coverage.rate >= 0.1
          ? `${fmt(coverage.unknown)} of ${fmt(cur.length)} current-period titles (${(coverage.rate * 100).toFixed(1)}%) have no country. Treat country rankings as directional.`
          : "Country values are production-country associations, not availability markets or languages.";
      })(),
      rows: cur.filter((r) => split(r.country).some((c) => driverNames.has(c))),
    };
  }
  if (
    /\b(recent|recently|newest|latest)\b/.test(q) &&
    /\breleas(ed|e|ing)\b/.test(q)
  ) {
    let recent = data.filter(
      (r) =>
        +r.release_year >= latestRelease - 1 &&
        +r.release_year <= latestRelease,
    );
    if (/tv show|tv shows|series/.test(q))
      recent = recent.filter((r) => r.type === "TV Show");
    else if (/movie|movies/.test(q))
      recent = recent.filter((r) => r.type === "Movie");
    if (requestedGenre)
      recent = recent.filter((r) => genreMatch(r, requestedGenre));
    return {
      status: "Definition applied",
      headline: `${fmt(recent.length)} titles match the recently released request.`,
      numbers: `Release years ${latestRelease - 1}–${latestRelease} · ${fmt(recent.length)} unique titles.`,
      scope: `Active ${requestedGenre ? requestedGenre.label + " " : ""}titles by release year`,
      calculation: `count(unique titles where release year is ${latestRelease - 1} or ${latestRelease})`,
      definition: `“Recently released” means the latest two release years present in the catalog: ${latestRelease - 1}–${latestRelease}.`,
      rows: recent,
    };
  }
  if (/\b(briefing|summary)\b/.test(q) && yearMatches.length === 1) {
    const y = yearMatches[0],
      period = data.filter((r) => yearAdded(r) === y);
    if (!period.length)
      return {
        status: "Limited by data",
        headline: `The catalog has no additions for ${y}.`,
        numbers: `The latest available addition year is ${latestAdded}.`,
        scope: `Active catalog records · date added year ${y}`,
        calculation: "count(records added in requested year)",
        limitation: `Import ${y} catalog data before preparing a supported briefing for that period.`,
        rows: [],
      };
  }
  const hasVagueTime =
    /\b(recent|recently|current|currently|new|newest|latest)\b/.test(q);
  if (hasVagueTime) {
    const released = /\breleas(ed|e|ing)\b/.test(q),
      added = /\b(add|added|additions?|arrived)\b/.test(q);
    if (!released && !added)
      return clarify(
        "What does the time reference apply to?",
        "“Recent” could mean when a title was released or when it entered the catalog. Those produce materially different results.",
        [
          {
            label: `Recently released (${latestRelease - 1}–${latestRelease})`,
            query: `${question.replace(/\b(recent|recently|current|currently|new|newest|latest)\b/gi, `${latestRelease - 1} through ${latestRelease}`)} by release year`,
          },
          {
            label: `Recently added (catalog year ${latestAdded})`,
            query: `${question.replace(/\b(recent|recently|current|currently|new|newest|latest)\b/gi, String(latestAdded))} by date added`,
          },
        ],
      );
    return clarify(
      "What period should “recently” mean?",
      `The requested date field is ${released ? "release year" : "date added"}, but no time window was defined.`,
      released
        ? [
            {
              label: `Latest 2 release years (${latestRelease - 1}–${latestRelease})`,
              query: `${question.replace(/\b(recent|recently|current|currently|new|newest|latest)\b/gi, `${latestRelease - 1} and ${latestRelease}`)}`,
            },
            {
              label: `Latest release year (${latestRelease})`,
              query: `${question.replace(/\b(recent|recently|current|currently|new|newest|latest)\b/gi, String(latestRelease))}`,
            },
          ]
        : [
            {
              label: `Latest catalog year (${latestAdded})`,
              query: `${question.replace(/\b(recent|recently|current|currently|new|newest|latest)\b/gi, String(latestAdded))}`,
            },
            {
              label: `Latest 2 catalog years (${latestAdded - 1}–${latestAdded})`,
              query: `${question.replace(/\b(recent|recently|current|currently|new|newest|latest)\b/gi, `${latestAdded - 1} and ${latestAdded}`)} by date added`,
            },
          ],
    );
  }
  if (
    yearMatches.length &&
    !/\b(add|added|additions?|arrived|release|released|release year|date added)\b/.test(
      q,
    )
  )
    return clarify(
      "Which date should the year filter use?",
      `${yearMatches.join(" and ")} could refer to release year or the date titles entered the catalog.`,
      [
        { label: "Use release year", query: `${question} by release year` },
        { label: "Use date added", query: `${question} by date added` },
      ],
    );
  if (
    /\b(compare|change|increase|decrease|growth|trend)\b/.test(q) &&
    yearMatches.length < 2
  )
    return clarify(
      "Which two periods should be compared?",
      "A comparison needs two explicit periods so the baseline and result cannot be silently assumed.",
      [],
    );
  let pool = data;
  const filters: string[] = [];
  if (/tv show|tv shows|series/.test(q)) {
    pool = pool.filter((r) => r.type === "TV Show");
    filters.push("Type = TV Show");
  } else if (/movie|movies/.test(q)) {
    pool = pool.filter((r) => r.type === "Movie");
    filters.push("Type = Movie");
  }
  if (yearMatches.length === 1) {
    const useRelease = /\b(release|released|release year)\b/.test(q);
    pool = pool.filter((r) =>
      useRelease
        ? +r.release_year === yearMatches[0]
        : yearAdded(r) === yearMatches[0],
    );
    filters.push(
      `${useRelease ? "Release year" : "Date added year"} = ${yearMatches[0]}`,
    );
  }
  if (
    yearMatches.length === 2 &&
    !/\b(compare|change|increase|decrease|versus|vs)\b/.test(q)
  ) {
    const [a, b] = yearMatches.sort((x, y) => x - y),
      useRelease = /\b(release|released|release year)\b/.test(q);
    pool = pool.filter((r) => {
      const y = useRelease ? +r.release_year : yearAdded(r) || 0;
      return y >= a && y <= b;
    });
    filters.push(
      `${useRelease ? "Release year" : "Date added year"} = ${a}–${b}`,
    );
  }
  const gt = requestedGenre;
  if (gt) {
    pool = pool.filter((r) => genreMatch(r, gt));
    filters.push(`Genre matches “${gt.label}”`);
  }
  const countryTerms = [
    "india",
    "united states",
    "korea",
    "japan",
    "canada",
    "france",
    "united kingdom",
    "spain",
    "mexico",
    "brazil",
  ];
  const ct = countryTerms.find((c) => q.includes(c));
  if (ct) {
    pool = pool.filter((r) => r.country.toLowerCase().includes(ct));
    filters.push(`Country contains “${ct}”`);
  }
  if (/missing.*country|country.*missing/.test(q)) {
    pool = pool.filter((r) => !r.country.trim());
    return result(
      "Verified",
      `${fmt(pool.length)} active titles are missing country information.`,
      `${fmt(pool.length)} of ${fmt(data.length)} active titles.`,
      filters,
      "count(records where country is blank)",
      pool,
    );
  }
  if (/missing.*rating|rating.*missing/.test(q)) {
    pool = pool.filter((r) => !r.rating.trim());
    return result(
      "Verified",
      `${fmt(pool.length)} active titles are missing rating information.`,
      `${fmt(pool.length)} of ${fmt(data.length)} active titles.`,
      filters,
      "count(records where rating is blank)",
      pool,
    );
  }
  if (/missing.*date|date.*missing/.test(q)) {
    pool = pool.filter((r) => !r.date_added.trim());
    return result(
      "Verified",
      `${fmt(pool.length)} active titles are missing date-added information.`,
      `${fmt(pool.length)} of ${fmt(data.length)} active titles.`,
      filters,
      "count(records where date added is blank)",
      pool,
    );
  }
  if (/duplicate/.test(q)) {
    const seen = new Map<string, Title[]>();
    data.forEach((r) => {
      const k = `${r.title}|${r.type}|${r.release_year}`.toLowerCase();
      seen.set(k, [...(seen.get(k) || []), r]);
    });
    pool = [...seen.values()].filter((x) => x.length > 1).flat();
    return result(
      "Verified",
      `${fmt(pool.length)} records belong to possible duplicate groups.`,
      "Matched on exact title, type, and release year; no records were changed.",
      filters,
      "group by normalized title + type + release year; keep groups > 1",
      pool,
    );
  }
  if (
    yearMatches.length >= 2 &&
    /(compare|change|increase|decrease|versus|vs)/.test(q)
  ) {
    const [a, b] = yearMatches,
      useRelease = /\b(release|released|release year)\b/.test(q);
    let base = data;
    if (/tv show|series/.test(q))
      base = base.filter((r) => r.type === "TV Show");
    if (/movie/.test(q)) base = base.filter((r) => r.type === "Movie");
    if (gt) base = base.filter((r) => genreMatch(r, gt));
    const ar = base.filter(
        (r) => (useRelease ? +r.release_year : yearAdded(r)) === a,
      ),
      br = base.filter(
        (r) => (useRelease ? +r.release_year : yearAdded(r)) === b,
      ),
      delta = br.length - ar.length,
      pct = ar.length ? (delta / ar.length) * 100 : 0;
    return {
      status: "Verified",
      headline: `${useRelease ? "Releases" : "Additions"} ${delta >= 0 ? "increased" : "decreased"} by ${Math.abs(pct).toFixed(1)}%, from ${fmt(ar.length)} in ${a} to ${fmt(br.length)} in ${b}.`,
      numbers: `${fmt(br.length - ar.length)} net change · ${fmt(ar.length + br.length)} supporting title records`,
      scope: `Active titles · ${gt ? `genre matches “${gt.label}” · ` : ""}${useRelease ? "release year" : "date added"} ${a} and ${b} · catalog version ${versionOf(rows)}`,
      calculation: `(${br.length} − ${ar.length}) ÷ ${ar.length} × 100`,
      limitation: gt
        ? "Multi-genre titles count once when the selected genre is present."
        : undefined,
      rows: [...ar, ...br],
    };
  }
  if (/\b(top|most|least)\b/.test(q) && !/country|genre|rating/.test(q))
    return clarify(
      "What should the catalog be ranked by?",
      "Choose a dimension so “top” or “most” has an explicit meaning.",
      [
        { label: "Rank countries", query: `${question} by country` },
        { label: "Rank genres", query: `${question} by genre` },
        { label: "Rank ratings", query: `${question} by rating` },
      ],
    );
  if (
    /top|most|least|break.*down|by country|by genre|by rating|by type/.test(q)
  ) {
    const field = /country/.test(q)
      ? "country"
      : /rating/.test(q)
        ? "rating"
        : /\btype\b/.test(q)
          ? "type"
          : "listed_in";
    const label = field === "listed_in" ? "genre" : field;
    const counts = new Map<string, number>();
    pool.forEach((r) =>
      split(r[field]).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1)),
    );
    const asc = /\bleast\b/.test(q);
    const ranked = [...counts]
      .sort((a, b) => (asc ? a[1] - b[1] : b[1] - a[1]))
      .slice(0, 5);
    return result(
      "Verified",
      `${ranked[0]?.[0] || "No category"} ${asc ? "has the fewest" : "leads the"} ${label} associations with ${fmt(ranked[0]?.[1] || 0)}.`,
      ranked.map(([k, v]) => `${k}: ${fmt(v)}`).join(" · "),
      filters,
      `split ${label} values; count associations; rank ${asc ? "ascending" : "descending"}`,
      pool,
      field === "country"
        ? "Country association totals can exceed unique titles because a title may list multiple countries."
        : field === "listed_in"
          ? "Category associations may exceed unique titles."
          : undefined,
    );
  }
  if (/percent|percentage|share/.test(q)) {
    let numerator = pool;
    if (/international/.test(q)) {
      const known = pool.filter((r) => r.country.trim());
      const unknown = pool.filter((r) => !r.country.trim());
      numerator = known.filter((r) =>
        split(r.country).some((c) => c !== "United States"),
      );
      const pctKnown = known.length ? (numerator.length / known.length) * 100 : 0;
      return {
        status: unknown.length ? "Verified with caveat" : "Verified",
        headline: `${pctKnown.toFixed(1)}% of titles with a known production country are international.`,
        numbers: `${fmt(numerator.length)} international · ${fmt(known.length)} known-country denominator · ${fmt(unknown.length)} unknown-country records excluded.`,
        scope: `${filters.length ? filters.join(" · ") : "All active titles"} · country-known denominator · catalog version ${versionOf(rows)}`,
        calculation: `${numerator.length} international titles ÷ ${known.length} titles with a known country × 100`,
        definition: "International = at least one listed production country outside the United States. US co-productions remain international under this definition.",
        limitation: [
          unknown.length
            ? `${(unknown.length / pool.length * 100).toFixed(1)}% of the selected population has no country and is shown separately rather than silently counted as domestic.`
            : "Production country is not language or market availability.",
          yearMatches.length === 1 && yearMatches[0] === latestAdded
            ? `${latestAdded} is available through the source cutoff only.`
            : "",
        ].filter(Boolean).join(" "),
        rows: numerator,
        evidenceGroups: [
          { label: "International numerator", rows: numerator },
          { label: "Known-country denominator", rows: known },
          { label: "Country unknown — excluded", rows: unknown },
        ],
      };
    } else if (/tv/.test(q)) {
      numerator = pool.filter((r) => r.type === "TV Show");
    }
    const pct = pool.length ? (numerator.length / pool.length) * 100 : 0;
    return result(
      "Definition applied",
      `${pct.toFixed(1)}% of the selected titles match.`,
      `${fmt(numerator.length)} of ${fmt(pool.length)} titles.`,
      filters,
      `${numerator.length} ÷ ${pool.length} × 100`,
      numerator,
      undefined,
    );
  }
  const recognized =
    filters.length > 0 ||
    /\b(how many|count|show|find|list|catalog|title|titles|movie|movies|tv show|series)\b/.test(
      q,
    );
  if (!recognized)
    return clarify(
      "I could not safely translate that question.",
      "Rephrase it with a metric, category, date field, or filter. No broad catalog result was returned.",
      [],
    );
  const genericAnswer = result(
    "Verified",
    `${fmt(pool.length)} active titles match the request.`,
    `${fmt(pool.length)} unique title records.`,
    filters,
    "count(unique active title IDs)",
    pool,
  );
  if (
    yearMatches.length === 1 &&
    !/\b(release|released|release year)\b/.test(q) &&
    yearMatches[0] === latestAdded
  )
    genericAnswer.limitation = `${latestAdded} additions are available only through the source cutoff. Compare with the aligned period in ${latestAdded - 1}, not that full year.`;
  return genericAnswer;
}
function result(
  status: string,
  headline: string,
  numbers: string,
  filters: string[],
  calc: string,
  rows: Title[],
  definition?: string,
): Answer {
  return {
    status,
    headline,
    numbers,
    scope: `${filters.length ? filters.join(" · ") : "All active titles"} · ${fmt(rows.length)} matching records`,
    calculation: calc,
    rows,
    definition,
  };
}
function clarify(
  headline: string,
  numbers: string,
  clarifications: { label: string; query: string }[],
): Answer {
  return {
    status: "Clarification required",
    headline,
    numbers,
    scope: "No records selected until the ambiguity is resolved",
    calculation: "No calculation performed",
    limitation: "A material ambiguity would change the result.",
    rows: [],
    clarifications,
  };
}
function followUps(q: string) {
  const x = q.toLowerCase();
  const genre = askedGenre(x)?.label;
  if (genre)
    return [
      `Break ${genre} titles down by type`,
      `Which countries contributed the most ${genre} titles?`,
      `Are we light on ${genre} titles compared to last year?`,
    ];
  if (/country|countries/.test(x))
    return [
      "Which countries contributed the most TV shows?",
      "Which countries drove growth in TV shows?",
      "Break the catalog down by country",
    ];
  if (/changed|growth|compare|last year/.test(x))
    return [
      "Which countries drove growth in TV shows?",
      "Are we light on documentaries compared to last year?",
      "What changed in the catalog this year?",
    ];
  return [
    "Break the catalog down by type",
    "Which countries contributed the most titles?",
    "What changed in the catalog this year?",
  ];
}
function versionOf(rows: Title[]) {
  return Math.max(1, Number(localStorage.getItem("sv_version") || 1));
}
function questionPlan(question: string) {
  const q = question.toLowerCase();
  const measure = /percent|percentage|share/.test(q)
    ? "share of titles"
    : /compare|change|growth|lighter|stronger|weak/.test(q)
      ? "comparison of title counts and shares"
      : /top|most|least|break.*down/.test(q)
        ? "ranked title associations"
        : "unique active title count";
  const time = /release/.test(q)
    ? "release year"
    : /add|arriv|catalog year|last year|this year/.test(q)
      ? "date added"
      : "no time field unless stated";
  const dimension = /country|international/.test(q)
    ? "production country"
    : /genre|documentar|horror|comedy|drama/.test(q)
      ? "semantic genre concept"
      : /rating/.test(q)
        ? "rating"
        : /tv|movie/.test(q)
          ? "title type"
          : "all active titles";
  return `Measure: ${measure} · Time: ${time} · Dimension: ${dimension}`;
}

export default function Home() {
  const [base, setBase] = useState<Title[]>([]),
    [changes, setChanges] = useState<Record<string, Title>>({}),
    [tab, setTab] = useState("Overview"),
    [query, setQuery] = useState(
      "What percentage of titles added in 2020 were international?",
    ),
    [answer, setAnswer] = useState<Answer | null>(null),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("active"),
    [quality, setQuality] = useState("all"),
    [editing, setEditing] = useState<Title | null>(null),
    [history, setHistory] = useState<History[]>([]),
    [saved, setSaved] = useState<Saved[]>([]),
    [importRows, setImportRows] = useState<Title[] | null>(null),
    [importOpen, setImportOpen] = useState(false),
    [canUndoImport, setCanUndoImport] = useState(false),
    [version, setVersion] = useState(1),
    [suggestions, setSuggestions] = useState(PROMPT_POOL.slice(0, 4));
  const refreshSuggestions = () =>
    setSuggestions(
      [...PROMPT_POOL].sort(() => Math.random() - 0.5).slice(0, 4),
    );
  useEffect(() => {
    fetch("netflix_titles.csv")
      .then((r) => r.text())
      .then((t) =>
        setBase(parseCSV(t).map((r) => ({ ...r, status: "active" }))),
      );
    refreshSuggestions();
    try {
      setChanges(JSON.parse(localStorage.getItem("sv_changes") || "{}"));
      setHistory(JSON.parse(localStorage.getItem("sv_history") || "[]"));
      setSaved(JSON.parse(localStorage.getItem("sv_saved") || "[]"));
      setVersion(+localStorage.getItem("sv_version")! || 1);
      setCanUndoImport(Boolean(localStorage.getItem("sv_import_backup")));
    } catch {}
  }, []);
  const rows = useMemo(
    () => [
      ...base.map((r) => changes[r.show_id] || r),
      ...Object.values(changes).filter(
        (r) => !base.some((b) => b.show_id === r.show_id),
      ),
    ],
    [base, changes],
  );
  const activeRows = active(rows);
  const persist = (next: Record<string, Title>, event: History) => {
    const h = [event, ...history];
    const v = version + 1;
    setChanges(next);
    setHistory(h);
    setVersion(v);
    localStorage.setItem("sv_changes", JSON.stringify(next));
    localStorage.setItem("sv_history", JSON.stringify(h));
    localStorage.setItem("sv_version", String(v));
  };
  const run = (e?: FormEvent) => {
    e?.preventDefault();
    const a = analyze(query, rows);
    setAnswer(a);
    setTab("Ask the Catalog");
  };
  const runQuestion = (question: string) => {
    setQuery(question);
    setAnswer(analyze(question, rows));
    setTab("Ask the Catalog");
  };
  const saveRecord = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const id = editing.show_id || `manual-${Date.now()}`,
      before = rows.find((r) => r.show_id === id),
      record = {
        ...editing,
        show_id: id,
        updated_at: new Date().toISOString(),
        status: editing.status || "active",
      } as Title;
    persist(
      { ...changes, [id]: record },
      {
        id: crypto.randomUUID(),
        action: before ? "edit" : "create",
        title: record.title,
        detail: before ? "Validated field updates saved" : "New title added",
        at: new Date().toISOString(),
      },
    );
    setEditing(null);
  };
  const toggleDelete = (r: Title) => {
    const restored = r.status === "deleted";
    if (
      !restored &&
      !window.confirm(
        `Remove “${r.title}” from active analysis? The record will remain recoverable.`,
      )
    )
      return;
    const rec = {
      ...r,
      status: restored ? "active" : "deleted",
      updated_at: new Date().toISOString(),
    } as Title;
    persist(
      { ...changes, [r.show_id]: rec },
      {
        id: crypto.randomUUID(),
        action: restored ? "restore" : "soft-delete",
        title: r.title,
        detail: restored
          ? "Returned to active analysis"
          : "Excluded from calculations; recoverable",
        at: new Date().toISOString(),
      },
    );
  };
  const visible = rows
    .filter(
      (r) =>
        (status === "all" || r.status === status) &&
        (quality === "all" ||
          (quality === "missing_country" && !r.country) ||
          (quality === "missing_rating" && !r.rating) ||
          (quality === "missing_date" && !r.date_added)) &&
        `${r.title} ${r.country} ${r.listed_in}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .slice(0, 100);
  const period = comparisonContext(activeRows);
  const latest = period.currentYear;
  const movies = activeRows.filter((r) => r.type === "Movie").length;
  const missingCountry = activeRows.filter((r) => !r.country).length,
    missingRating = activeRows.filter((r) => !r.rating).length,
    missingDate = activeRows.filter((r) => !r.date_added).length,
    missing = activeRows.filter(
      (r) => !r.country || !r.date_added || !r.rating || !r.duration,
    ).length;
  const latestRows = period.current,
    previousRows = period.previous,
    additionChange = previousRows.length
      ? ((latestRows.length - previousRows.length) / previousRows.length) * 100
      : 0,
    latestTV = latestRows.filter((r) => r.type === "TV Show").length,
    previousTV = previousRows.filter((r) => r.type === "TV Show").length,
    latestDate = period.latestDate;
  const top = (field: "listed_in" | "country") => {
    const m = new Map<string, number>();
    activeRows.forEach((r) =>
      split(r[field]).forEach((x) => m.set(x, (m.get(x) || 0) + 1)),
    );
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  const conceptTop = GENRES.map((g) => [
    g.label,
    activeRows.filter((r) => genreMatch(r, g)).length,
  ] as [string, number]).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const genreShift = GENRES.map((g) => {
    const current = latestRows.filter((r) => genreMatch(r, g));
    const previous = previousRows.filter((r) => genreMatch(r, g));
    return {
      label: g.label,
      change: (latestRows.length ? current.length / latestRows.length : 0) -
        (previousRows.length ? previous.length / previousRows.length : 0),
    };
  }).sort((a, b) => b.change - a.change);
  const libraryShare = (rs: Title[]) =>
    rs.length
      ? rs.filter((r) => (yearAdded(r) || 0) - (+r.release_year || 0) >= 10).length / rs.length
      : 0;
  const currentCountryCoverage = countryCoverage(latestRows);
  const dayCounts = new Map<string, number>();
  activeRows.forEach((r) => {
    const d = catalogDate(r.date_added);
    if (d) {
      const key = d.toISOString().slice(0, 10);
      dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
    }
  });
  const batchRows = [...dayCounts.values()].filter((n) => n >= 20).reduce((a, b) => a + b, 0);
  const importReview = useMemo(() => {
    if (!importRows) return null;
    const seen = new Set<string>();
    const duplicateIds = new Set<string>();
    importRows.forEach((r) => {
      if (seen.has(r.show_id)) duplicateIds.add(r.show_id);
      seen.add(r.show_id);
    });
    const blocking = importRows.filter((r) => importProblems(r).blocking.length);
    const warnings = importRows.filter((r) => importProblems(r).warnings.length);
    const blankOverwrites = importRows.filter((r) => {
      const old = rows.find((x) => x.show_id === r.show_id);
      return old && ["country", "rating", "duration", "director", "cast", "description"].some(
        (key) => Boolean(old[key as keyof Title]) && !r[key as keyof Title],
      );
    });
    return { blocking, warnings, duplicateIds, blankOverwrites };
  }, [importRows, rows]);
  const exportRows = (rs: Title[]) => {
    const keys = [
      "show_id",
      "type",
      "title",
      "country",
      "date_added",
      "release_year",
      "rating",
      "duration",
      "listed_in",
    ];
    const blob = new Blob(
      [
        [
          keys.join(","),
          ...rs.map((r) =>
            keys.map((k) => csvEscape(r[k as keyof Title] || "")).join(","),
          ),
        ].join("\n"),
      ],
      { type: "text/csv" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "streamvault-export.csv";
    a.click();
  };
  const importFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) f.text().then((t) => setImportRows(parseCSV(t)));
  };
  const applyImport = () => {
    if (!importRows || importReview?.blocking.length || importReview?.duplicateIds.size) return;
    localStorage.setItem(
      "sv_import_backup",
      JSON.stringify({ changes, savedAt: new Date().toISOString() }),
    );
    const next = { ...changes };
    let added = 0,
      updated = 0;
    importRows.forEach((r) => {
      const existing = rows.find((x) => x.show_id === r.show_id);
      next[r.show_id] = {
        ...r,
        status: "active",
        updated_at: new Date().toISOString(),
      };
      existing ? updated++ : added++;
    });
    persist(next, {
      id: crypto.randomUUID(),
      action: "import",
      title: "Catalog import",
      detail: `${added} added · ${updated} updated · approved after review`,
      at: new Date().toISOString(),
    });
    setImportRows(null);
    setImportOpen(false);
    setCanUndoImport(true);
  };
  const undoLastImport = () => {
    try {
      const backup = JSON.parse(localStorage.getItem("sv_import_backup") || "null");
      if (!backup?.changes) return;
      persist(backup.changes, {
        id: crypto.randomUUID(),
        action: "rollback-import",
        title: "Catalog import",
        detail: "Restored catalog state from before the last import",
        at: new Date().toISOString(),
      });
      localStorage.removeItem("sv_import_backup");
      setCanUndoImport(false);
    } catch {
      setCanUndoImport(false);
    }
  };
  const saveAnalysis = () => {
    if (!answer) return;
    const { rows: evidenceRows, evidenceGroups, ...answerSnapshot } = answer;
    const n: Saved = {
      id: crypto.randomUUID(),
      question: query,
      answer: answer.headline,
      at: new Date().toISOString(),
      version,
      engineVersion: ENGINE_VERSION,
      snapshot: {
        ...answerSnapshot,
        recordIds: evidenceRows.map((r) => r.show_id),
        evidenceGroups: evidenceGroups?.map((group) => ({
          label: group.label,
          recordIds: group.rows.map((r) => r.show_id),
        })),
      },
    };
    const s = [n, ...saved];
    setSaved(s);
    localStorage.setItem("sv_saved", JSON.stringify(s));
  };
  return (
    <main>
      <header>
        <div className="brand">
          <span className="mark">S</span>
          <div>
            <strong>StreamVault</strong>
            <small>Catalog Intelligence</small>
          </div>
        </div>
        <nav>
          {["Overview", "Ask the Catalog", "Catalog", "Briefings"].map((x) => (
            <button
              className={tab === x ? "active" : ""}
              onClick={() => setTab(x)}
              key={x}
            >
              {x}
            </button>
          ))}
        </nav>
        <div className="version">
          Catalog v{version}
          <span>Historical source · Sep 25, 2021 cutoff</span>
        </div>
      </header>
      <section className="shell">
        {tab === "Overview" && (
          <>
            <div className="eyebrow">CATALOG COMMAND CENTER</div>
            <div className="titleRow">
              <div>
                <h1>Know what changed. Know what to trust.</h1>
                <p>
                  Catalog health, movement, and the evidence behind every
                  decision.
                </p>
              </div>
              <div>
                {canUndoImport && (
                  <button className="secondary" onClick={undoLastImport}>
                    Undo last import
                  </button>
                )}
                <button
                  className="secondary"
                  onClick={() => setImportOpen(true)}
                >
                  Review import
                </button>
                <button
                  className="primary"
                  onClick={() => setTab("Ask the Catalog")}
                >
                  Ask a question
                </button>
              </div>
            </div>
            <div className="coverage">
              <div>
                <small>DATA COVERAGE</small>
                <b>
                  Catalog additions through{" "}
                  {latestDate ? formatCatalogDate(latestDate) : "—"}
                </b>
              </div>
              <div>
                <small>COMPARISON WINDOW</small>
                <b>{period.partial ? `${period.label} · ${period.previousYear}/${period.currentYear}` : `${latest} full year`}</b>
              </div>
              <div>
                <small>CATALOG VERSION</small>
                <b>v{version}</b>
              </div>
              <span className="freshness">
                Historical dataset snapshot · through {formatCatalogDate(latestDate)} · no removal history
              </span>
            </div>
            <div className="metrics">
              <button onClick={() => setTab("Catalog")}>
                <small>Active titles</small>
                <b>{fmt(activeRows.length)}</b>
                <span>Open catalog records</span>
              </button>
              <button
                onClick={() => runQuestion("Break the catalog down by type")}
              >
                <small>Movies / TV shows</small>
                <b>
                  {fmt(movies)} <i>/ {fmt(activeRows.length - movies)}</i>
                </b>
                <span>
                  {activeRows.length
                    ? ((movies / activeRows.length) * 100).toFixed(1)
                    : 0}
                  % movies
                </span>
              </button>
              <button
                onClick={() =>
                  runQuestion(
                    `How many titles were added in ${latest} by date added?`,
                  )
                }
              >
                <small>{period.partial ? `${latest} YTD additions` : `${latest} additions`}</small>
                <b>{fmt(latestRows.length)}</b>
                <span>
                  {additionChange >= 0 ? "+" : ""}
                  {additionChange.toFixed(1)}% vs aligned {latest - 1}
                </span>
              </button>
              <button
                className="attention"
                onClick={() =>
                  runQuestion("Which records are missing country information?")
                }
              >
                <small>Attention needed</small>
                <b>{fmt(missing)}</b>
                <span>Records missing key information</span>
              </button>
            </div>
            <div className="overviewGrid">
              <article className="movement">
                <div className="articleHead">
                  <div>
                    <h2>What changed</h2>
                    <p>
                      {period.partial ? `${period.label} in ${latest - 1} and ${latest}` : `${latest} compared with ${latest - 1}`}
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      runQuestion("What changed in the catalog this year?")
                    }
                  >
                    Explore evidence →
                  </button>
                </div>
                <div className="movementStats">
                  <div>
                    <small>TOTAL ADDITIONS</small>
                    <b>
                      {fmt(previousRows.length)} → {fmt(latestRows.length)}
                    </b>
                    <span className={additionChange < 0 ? "down" : "up"}>
                      {additionChange >= 0 ? "+" : ""}
                      {additionChange.toFixed(1)}%
                    </span>
                  </div>
                  <div>
                    <small>TV SHOWS</small>
                    <b>
                      {fmt(previousTV)} → {fmt(latestTV)}
                    </b>
                    <span>
                      {latestTV - previousTV >= 0 ? "+" : ""}
                      {fmt(latestTV - previousTV)} titles
                    </span>
                  </div>
                  <div>
                    <small>MOVIES</small>
                    <b>
                      {fmt(previousRows.length - previousTV)} →{" "}
                      {fmt(latestRows.length - latestTV)}
                    </b>
                    <span>
                      {latestRows.length -
                        latestTV -
                        (previousRows.length - previousTV) >=
                      0
                        ? "+"
                        : ""}
                      {fmt(
                        latestRows.length -
                          latestTV -
                          (previousRows.length - previousTV),
                      )}{" "}
                      titles
                    </span>
                  </div>
                </div>
              </article>
              <article className="readiness">
                <div className="articleHead">
                  <div>
                    <h2>Data readiness</h2>
                    <p>Issues that can affect answers</p>
                  </div>
                  <button onClick={() => setTab("Catalog")}>
                    Open catalog →
                  </button>
                </div>
                <button
                  onClick={() =>
                    runQuestion(
                      "Which records are missing country information?",
                    )
                  }
                >
                  <span>Missing country</span>
                  <b>{fmt(missingCountry)}</b>
                </button>
                <button
                  onClick={() => {
                    setSearch("");
                    setStatus("active");
                    setQuality("missing_rating");
                    setTab("Catalog");
                  }}
                >
                  <span>Missing rating</span>
                  <b>{fmt(missingRating)}</b>
                </button>
                <button
                  onClick={() => {
                    setSearch("");
                    setStatus("active");
                    setQuality("missing_date");
                    setTab("Catalog");
                  }}
                >
                  <span>Missing date added</span>
                  <b>{fmt(missingDate)}</b>
                </button>
                <p className="note">
                  Director gaps are assessed by type: they are common for TV shows in this source and are not treated as a catalog-health failure.
                </p>
              </article>
            </div>
            <article className="movement insightScan">
              <div className="articleHead">
                <div>
                  <h2>Worth noticing</h2>
                  <p>Signals with their caveats attached</p>
                </div>
                <button onClick={() => runQuestion("Are we light on documentaries compared to last year?")}>Test a signal →</button>
              </div>
              <div className="movementStats">
                <div>
                  <small>LARGEST CONCEPT GAIN</small>
                  <b>{genreShift[0]?.label || "—"}</b>
                  <span>+{((genreShift[0]?.change || 0) * 100).toFixed(1)} share points</span>
                </div>
                <div>
                  <small>LIBRARY ACQUISITIONS</small>
                  <b>{(libraryShare(previousRows) * 100).toFixed(1)}% → {(libraryShare(latestRows) * 100).toFixed(1)}%</b>
                  <span>Titles released 10+ years before addition</span>
                </div>
                <div>
                  <small>COUNTRY COVERAGE</small>
                  <b>{(currentCountryCoverage.rate * 100).toFixed(1)}% unknown</b>
                  <span>{currentCountryCoverage.rate >= 0.1 ? "Country insights are directional" : "Country insights are well covered"}</span>
                </div>
                <div>
                  <small>ADDITION BATCHING</small>
                  <b>{activeRows.length ? ((batchRows / activeRows.length) * 100).toFixed(1) : 0}%</b>
                  <span>Added on dates with 20+ titles</span>
                </div>
              </div>
            </article>
            <div className="grid2">
              <article>
                <div className="articleHead">
                  <h2>Catalog composition</h2>
                  <button
                    onClick={() =>
                      runQuestion("Which genres have the most titles?")
                    }
                  >
                    Ask about genres →
                  </button>
                </div>
                <h3>Top genres</h3>
                {conceptTop.map(([k, v]) => (
                  <div className="bar" key={k}>
                    <span>{k}</span>
                    <i
                      style={{
                        width: `${(v / (conceptTop[0]?.[1] || 1)) * 100}%`,
                      }}
                    />
                    <b>{fmt(v)}</b>
                  </div>
                ))}
              </article>
              <article>
                <div className="articleHead">
                  <h2>Global catalog</h2>
                  <button
                    onClick={() =>
                      runQuestion(
                        "Which countries contributed the most titles?",
                      )
                    }
                  >
                    Ask about countries →
                  </button>
                </div>
                <h3>Top country associations</h3>
                {top("country").map(([k, v]) => (
                  <div className="rank" key={k}>
                    <span>{k}</span>
                    <b>{fmt(v)}</b>
                  </div>
                ))}
              </article>
            </div>
            <article className="activity">
              <div>
                <h2>Recent catalog activity</h2>
                <p>Auditable edits, imports, deletions, and restores.</p>
              </div>
              {history.length ? (
                history.slice(0, 4).map((h) => (
                  <div className="history" key={h.id}>
                    <span className={`dot ${h.action}`} />
                    <div>
                      <b>{h.title}</b>
                      <small>
                        {h.action} · {h.detail}
                      </small>
                    </div>
                    <time>{new Date(h.at).toLocaleDateString()}</time>
                  </div>
                ))
              ) : (
                <div className="empty">
                  No catalog changes yet. Your first edit will appear here.
                </div>
              )}
            </article>
          </>
        )}
        {tab === "Ask the Catalog" && (
          <>
            <div className="eyebrow">DETERMINISTIC ANALYSIS</div>
            <h1>Ask the catalog</h1>
            <p className="lead">
              Questions are translated into visible filters and exact
              calculations—not invented numbers.
            </p>
            <form className="ask" onSubmit={run}>
              <textarea
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Catalog question"
              />
              <button className="primary">Calculate answer</button>
            </form>
            <div className="suggestionHead">
              <small>SUGGESTED QUESTIONS</small>
              <button onClick={refreshSuggestions}>↻ Refresh</button>
            </div>
            <div className="examples">
              {suggestions.map((x) => (
                <button
                  onClick={() => {
                    setQuery(x);
                    setAnswer(null);
                  }}
                  key={x}
                >
                  {x}
                </button>
              ))}
            </div>
            {answer && (
              <article
                className={`answer ${answer.status === "Clarification required" ? "clarify" : ""}`}
              >
                <div className="answerStatus">
                  <span>●</span>
                  {answer.status}
                </div>
                <h2>{answer.headline}</h2>
                <p className="numbers">{answer.numbers}</p>
                {answer.clarifications && answer.clarifications.length > 0 && (
                  <div className="clarificationChoices">
                    {answer.clarifications.map((c) => (
                      <button
                        key={c.label}
                        onClick={() => {
                          setQuery(c.query);
                          setAnswer(null);
                        }}
                      >
                        <b>{c.label}</b>
                        <span>Use this interpretation</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="evidence">
                  <div>
                    <small>Scope</small>
                    <p>
                      {answer.scope}{answer.scope.includes("catalog version") ? "" : ` · catalog version ${version}`}
                    </p>
                  </div>
                  <div>
                    <small>Question plan</small>
                    <p>{questionPlan(query)}</p>
                  </div>
                  <div>
                    <small>Calculation</small>
                    <code>{answer.calculation}</code>
                  </div>
                  {answer.definition && (
                    <div>
                      <small>Definition</small>
                      <p>{answer.definition}</p>
                    </div>
                  )}
                  {answer.limitation && (
                    <div>
                      <small>Trust note</small>
                      <p>{answer.limitation}</p>
                    </div>
                  )}
                </div>
                {answer.status !== "Clarification required" && (
                  <>
                    <div className="actions">
                      <button onClick={saveAnalysis}>Save to Briefings</button>
                      <button onClick={() => exportRows(answer.rows)}>
                        Export evidence
                      </button>
                      <button onClick={() => setTab("Catalog")}>
                        Open catalog
                      </button>
                    </div>
                    <div className="followUps">
                      <small>CONTINUE THE ANALYSIS</small>
                      {followUps(query).map((x) => (
                        <button
                          key={x}
                          onClick={() => {
                            setQuery(x);
                            setAnswer(null);
                          }}
                        >
                          → {x}
                        </button>
                      ))}
                    </div>
                    {answer.evidenceGroups?.length ? (
                      <div className="evidenceGroups">
                        {answer.evidenceGroups.map((group) => (
                          <Evidence key={group.label} rows={group.rows} title={group.label} />
                        ))}
                      </div>
                    ) : (
                      <Evidence rows={answer.rows} />
                    )}
                  </>
                )}
              </article>
            )}
          </>
        )}
        {tab === "Catalog" && (
          <>
            <div className="titleRow">
              <div>
                <div className="eyebrow">CATALOG MANAGEMENT</div>
                <h1>Catalog</h1>
                <p>Search, correct, remove, restore, and export titles.</p>
              </div>
              <div>
                <button
                  className="secondary"
                  onClick={() => setImportOpen(true)}
                >
                  Review import
                </button>
                <button
                  className="primary"
                  onClick={() => setEditing({ ...EMPTY })}
                >
                  Add title
                </button>
              </div>
            </div>
            <div className="toolbar">
              <input
                placeholder="Search title, country, or genre"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="deleted">Deleted</option>
                <option value="all">All statuses</option>
              </select>
              <select
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
                aria-label="Data quality filter"
              >
                <option value="all">All data quality</option>
                <option value="missing_country">Missing country</option>
                <option value="missing_rating">Missing rating</option>
                <option value="missing_date">Missing date added</option>
              </select>
              <button onClick={() => exportRows(visible)}>
                Export filtered
              </button>
              <span>{fmt(visible.length)} shown (100 max)</span>
            </div>
            <Evidence
              rows={visible}
              editable
              onEdit={setEditing}
              onDelete={toggleDelete}
            />
          </>
        )}
        {tab === "Briefings" && (
          <>
            <div className="eyebrow">MEETING-READY WORK</div>
            <h1>Briefings</h1>
            <p className="lead">
              Preserve the original conclusion, see whether catalog changes
              affected it, and take verified evidence into the meeting.
            </p>
            <div className="reportGrid">
              <article>
                <h2>Saved briefings</h2>
                {saved.length ? (
                  saved.map((s) => (
                    <BriefingCard
                      key={s.id}
                      saved={s}
                      rows={rows}
                      currentVersion={version}
                      onOpen={(a) => {
                        setQuery(s.question);
                        setAnswer(a);
                        setTab("Ask the Catalog");
                      }}
                      onDelete={() => {
                        const next = saved.filter((item) => item.id !== s.id);
                        setSaved(next);
                        localStorage.setItem("sv_saved", JSON.stringify(next));
                      }}
                    />
                  ))
                ) : (
                  <div className="empty">
                    Save a supported answer to create your first briefing.
                  </div>
                )}
              </article>
              <article>
                <h2>Current catalog briefing</h2>
                <div className="meeting">
                  <small>Catalog v{version} · current data</small>
                  <h3>Catalog acquisition briefing</h3>
                  <p>
                    The catalog contains <b>{fmt(activeRows.length)}</b> active
                    titles: <b>{fmt(movies)}</b> movies and{" "}
                    <b>{fmt(activeRows.length - movies)}</b> TV shows. The
                    latest available addition year is <b>{latest}</b>, with{" "}
                    <b>
                      {fmt(
                        activeRows.filter((r) => yearAdded(r) === latest)
                          .length,
                      )}
                    </b>{" "}
                    additions.
                  </p>
                  <p>
                    <b>{top("listed_in")[0]?.[0]}</b> is the leading genre
                    association. <b>{fmt(missing)}</b> titles need data-quality
                    attention.
                  </p>
                  <p className="note">
                    Catalog composition only; this dataset cannot determine
                    audience demand, performance, licensing value, or
                    acquisition priority.
                  </p>
                  <button
                    onClick={() =>
                      navigator.clipboard.writeText(
                        `Catalog v${version} briefing: ${fmt(activeRows.length)} active titles; ${fmt(activeRows.filter((r) => yearAdded(r) === latest).length)} additions in ${latest}.`,
                      )
                    }
                  >
                    Copy meeting summary
                  </button>
                </div>
              </article>
            </div>
          </>
        )}
      </section>
      {editing && (
        <div className="modal">
          <form className="panel" onSubmit={saveRecord}>
            <div className="panelHead">
              <div>
                <small>{editing.show_id ? "EDIT TITLE" : "NEW TITLE"}</small>
                <h2>{editing.title || "Add catalog title"}</h2>
              </div>
              <button type="button" onClick={() => setEditing(null)}>
                ×
              </button>
            </div>
            <div className="fields">
              {(
                [
                  "title",
                  "type",
                  "release_year",
                  "date_added",
                  "listed_in",
                  "country",
                  "rating",
                  "duration",
                  "director",
                  "cast",
                  "description",
                ] as (keyof Title)[]
              ).map((k) => (
                <label
                  className={k === "description" || k === "cast" ? "wide" : ""}
                  key={k}
                >
                  <span>
                    {k.replaceAll("_", " ")}
                    {[
                      "title",
                      "type",
                      "release_year",
                      "date_added",
                      "listed_in",
                    ].includes(k)
                      ? " *"
                      : ""}
                  </span>
                  {k === "type" ? (
                    <select
                      value={editing[k]}
                      onChange={(e) =>
                        setEditing({ ...editing, [k]: e.target.value })
                      }
                    >
                      <option>Movie</option>
                      <option>TV Show</option>
                    </select>
                  ) : k === "description" || k === "cast" ? (
                    <textarea
                      value={editing[k]}
                      onChange={(e) =>
                        setEditing({ ...editing, [k]: e.target.value })
                      }
                    />
                  ) : (
                    <input
                      required={[
                        "title",
                        "release_year",
                        "date_added",
                        "listed_in",
                      ].includes(k)}
                      value={editing[k]}
                      onChange={(e) =>
                        setEditing({ ...editing, [k]: e.target.value })
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            {editing.show_id && (
              <div className="recordHistory">
                <h3>Record history</h3>
                {history.filter((h) => h.title === editing.title).length ? (
                  history
                    .filter((h) => h.title === editing.title)
                    .slice(0, 5)
                    .map((h) => (
                      <div className="history" key={h.id}>
                        <span className={`dot ${h.action}`} />
                        <div>
                          <b>{h.action}</b>
                          <small>{h.detail}</small>
                        </div>
                        <time>{new Date(h.at).toLocaleString()}</time>
                      </div>
                    ))
                ) : (
                  <p>No recorded changes for this title.</p>
                )}
              </div>
            )}
            <div className="panelActions">
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="primary">Validate & save</button>
            </div>
          </form>
        </div>
      )}
      {importOpen && (
        <div className="modal">
          <div className="panel importPanel">
            <div className="panelHead">
              <div>
                <small>SAFE IMPORT REVIEW</small>
                <h2>Review before applying</h2>
              </div>
              <button
                onClick={() => {
                  setImportOpen(false);
                  setImportRows(null);
                }}
              >
                ×
              </button>
            </div>
            {!importRows ? (
              <label className="drop">
                <b>Choose a catalog CSV</b>
                <span>Nothing will change until review is approved.</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={importFile}
                />
              </label>
            ) : (
              <>
                <div className="importStats">
                  <div>
                    <small>Rows received</small>
                    <b>{fmt(importRows.length)}</b>
                  </div>
                  <div>
                    <small>Proposed adds</small>
                    <b>
                      {fmt(
                        importRows.filter(
                          (r) => !rows.some((x) => x.show_id === r.show_id),
                        ).length,
                      )}
                    </b>
                  </div>
                  <div>
                    <small>Proposed updates</small>
                    <b>
                      {fmt(
                        importRows.filter((r) =>
                          rows.some((x) => x.show_id === r.show_id),
                        ).length,
                      )}
                    </b>
                  </div>
                  <div>
                    <small>Blocking issues</small>
                    <b>{fmt(importReview?.blocking.length || 0)}</b>
                  </div>
                  <div>
                    <small>Duplicate source IDs</small>
                    <b>{fmt(importReview?.duplicateIds.size || 0)}</b>
                  </div>
                  <div>
                    <small>Blank overwrite warnings</small>
                    <b>{fmt(importReview?.blankOverwrites.length || 0)}</b>
                  </div>
                </div>
                <div className="warning">
                  Exact source IDs only. Dates, types, release years, required
                  fields, and misplaced durations are blocked. Blank overwrite,
                  unusual duration, and missing-country risks remain visible for review.
                </div>
                {!!importReview?.warnings.length && (
                  <div className="warning">
                    {fmt(importReview.warnings.length)} records have non-blocking data-quality warnings.
                  </div>
                )}
                {!!importReview?.blankOverwrites.length && (
                  <div className="warning">
                    {fmt(importReview.blankOverwrites.length)} updates would replace existing populated fields with blanks. Review these records before approval.
                  </div>
                )}
                <Evidence rows={importRows.slice(0, 20)} />
                <div className="panelActions">
                  <button onClick={() => setImportRows(null)}>
                    Choose another file
                  </button>
                  <button
                    className="primary"
                    onClick={applyImport}
                    disabled={Boolean(importReview?.blocking.length || importReview?.duplicateIds.size)}
                  >
                    Approve & apply
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function BriefingCard({
  saved,
  rows,
  currentVersion,
  onOpen,
  onDelete,
}: {
  saved: Saved;
  rows: Title[];
  currentVersion: number;
  onOpen: (a: Answer) => void;
  onDelete: () => void;
}) {
  const current = analyze(saved.question, rows),
    changed =
      current.headline !== saved.answer || currentVersion !== saved.version;
  return (
    <div className="saved">
      <div className="briefingMeta">
        <small>
          Saved from catalog v{saved.version} ·{" "}
          {new Date(saved.at).toLocaleDateString()} · engine {saved.engineVersion || "1.0"}
        </small>
        <span className={changed ? "changed" : "current"}>
          {changed ? "● Review changes" : "● Current"}
        </span>
      </div>
      <b>{saved.question}</b>
      <div className="resultCompare">
        <div>
          <small>ORIGINAL</small>
          <p>{saved.answer}</p>
          {saved.snapshot?.numbers && <p>{saved.snapshot.numbers}</p>}
        </div>
        <div>
          <small>CURRENT · V{currentVersion}</small>
          <p>{current.headline}</p>
        </div>
      </div>
      <div>
        <button onClick={() => onOpen(current)}>Open current evidence</button>
        <button
          onClick={() =>
            navigator.clipboard.writeText(
              `${saved.question}\n\nOriginal: ${saved.answer}\nCurrent: ${current.headline}\n${current.numbers}`,
            )
          }
        >
          Copy briefing
        </button>
        <button
          onClick={() => {
            if (
              window.confirm(`Delete the saved briefing “${saved.question}”?`)
            )
              onDelete();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
function Evidence({
  rows,
  title = "Evidence table",
  editable,
  onEdit,
  onDelete,
}: {
  rows: Title[];
  title?: string;
  editable?: boolean;
  onEdit?: (r: Title) => void;
  onDelete?: (r: Title) => void;
}) {
  const shown = rows.slice(0, 50);
  return (
    <div className="tableWrap">
      <div className="tableHead">
        <h3>{title}</h3>
        <span>
          {fmt(rows.length)} supporting records · showing {fmt(shown.length)}
        </span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>Type</th>
            <th>Country</th>
            <th>Genre</th>
            <th>Release</th>
            <th>Date added</th>
            <th>Rating</th>
            {editable && <th />}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr
              className={r.status === "deleted" ? "deleted" : ""}
              key={r.show_id}
            >
              <td>
                <b>{r.title}</b>
                <small>{r.show_id}</small>
              </td>
              <td>{r.type}</td>
              <td>{r.country || <em>Missing</em>}</td>
              <td>{r.listed_in}</td>
              <td>{r.release_year}</td>
              <td>{r.date_added || <em>Missing</em>}</td>
              <td>{r.rating || <em>Missing</em>}</td>
              {editable && (
                <td className="rowActions">
                  <button onClick={() => onEdit?.(r)}>Edit</button>
                  <button onClick={() => onDelete?.(r)}>
                    {r.status === "deleted" ? "Restore" : "Remove"}
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">No supporting records for this result.</div>
      )}
    </div>
  );
}
