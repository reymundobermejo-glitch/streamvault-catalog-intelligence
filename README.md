# StreamVault Catalog Intelligence

An evidence-first catalog analysis MVP. It is designed to make a catalog question inspectable: every answer shows its scope, calculation, definition, trust note, and supporting records.

## From interface concept to working intelligence

Without a catalog behind it, StreamVault would be a polished interface with placeholder trends and generic prompts. With the bundled catalog, it becomes a working decision tool: it calculates actual title counts, detects incomplete comparison windows, reveals missing metadata, supports record correction, and connects every conclusion to the titles that produced it.

That shift is the point of the project. The product does not merely display information; it helps a user decide whether a question is answerable, what the data actually supports, and where the data needs attention.

## What it does

- Gives deterministic answers for catalog counts, comparisons, representation, rankings, country coverage, and data-quality questions
- Aligns partial periods automatically: the supplied source ends on **September 25, 2021**, so 2021 comparisons use the matching 2020 window
- Treats ambiguous questions carefully: expands compatible interpretations such as volume and share, or asks for clarification where a single answer would be misleading
- Uses shared genre concepts across Overview and Ask (for example, documentary includes both `Documentaries` and `Docuseries`)
- Separates known and unknown country records in international calculations
- Provides evidence groups for numerators, denominators, unknown records, and comparison periods
- Supports search, edit, soft-delete, restore, history, saved briefings, and safe CSV import review with rollback

## Analytical boundaries

The included catalog supports catalog-composition analysis only.

It does **not** support claims about demand, performance, licensing value, market availability, exact release dates, audience behavior, or net catalog growth. The app identifies these boundaries instead of making unsupported recommendations.

## Local setup

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm test
```

The test suite checks the production build, core UI contracts, aligned 2020/2021 period calculations, country-coverage risk, and known source defects.

## Submission note

This is a front-end MVP. Catalog edits, history, imports, and saved briefings are stored in the browser for demonstration. A shared production release would add authenticated persistent storage and a server-side audit log.
