# StreamVault technical architecture and implementation sequence

## Architecture

- **Catalog source:** the approved 12-column Netflix CSV is parsed by a quote-safe streaming-style parser. Source IDs remain stable; countries and genres are split only at analysis time, preserving source values.
- **Catalog state:** immutable source records are overlaid with a versioned change set. Add, edit, soft-delete, restore, and approved import operations create history entries and increment the catalog version.
- **Analysis engine:** natural-language cues compile to explicit filters, time fields, comparable periods, metrics, groupings, and definitions. JavaScript performs counts, percentages, comparisons, rankings, and quality audits deterministically. Partial periods are aligned to the same month/day boundary in the prior year; unsupported performance or demand requests return `Limited by data`.
- **Definitions and evidence:** shared concept definitions drive both Overview and Ask. Every result returns status, direct answer, supporting numbers, scope, formula, definition or limitation, catalog version, and evidence rows. Percentage answers can preserve numerator, denominator, and unknown-record evidence separately.
- **Safety:** imports are parsed and staged before application, matched only by exact source ID, blocked for invalid IDs, types, years, dates, and misplaced durations. The review also flags blank overwrites, missing country values, unusual duration formats, and duplicate source IDs. The most recent import can be rolled back.
- **Persistence:** this MVP deliberately retains edits, versions, history, saved analyses, and one import rollback point in the user’s browser so the static build remains self-contained. A production multi-user phase should move the same event and snapshot model to D1 with authenticated ownership and server-side audit history.
- **Source boundary:** the bundled data is a historical snapshot through September 25, 2021. It has no removal history, market availability, language, costs, or performance fields; the UI labels these limits rather than inferring them.

## Implementation sequence

1. Load and normalize the approved catalog without changing source values.
2. Establish versioned catalog overlays and auditable mutations.
3. Implement deterministic query families and answer statuses.
4. Connect every number to an evidence table and CSV export.
5. Add catalog editing, soft deletion, restoration, and history.
6. Add staged import review with exact-ID matching and validation.
7. Add saved analyses, reruns, meeting summaries, and copy/export actions.
8. Add dataset-level regression checks for the 2021 source cutoff, aligned documentary comparison, country coverage, and known source defects.
9. Verify product shell, trust boundaries, source schema, compilation, and interactive rendering.
