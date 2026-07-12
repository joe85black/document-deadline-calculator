# Document Deadline Calculator

An Apps Script that computes a document-submission deadline from a base expiration date, a case category/package type, and a rush-fee tier — working backward across US federal holidays and weekends to land on a real business day.

> All example values in this README are fabricated. Case-category and package-type labels are genericized (see [Case Category Key](#case-category-key)); every day-offset and rush-fee percentage is unchanged from the working script.

## What it's for

Given a status/contract expiration date, the type of case being filed, and whether a rush fee applies, this script works out how many business days before that expiration the paperwork needs to be submitted — skipping weekends, a fixed list of US federal-style holidays, and a year-end office closure block (Dec 22–Jan 2).

It's the Apps Script counterpart to the same rule set already published as a plain Google Sheets array formula in [google-sheets-formulas](https://github.com/joe85black/google-sheets-formulas) (`formulas/deadline-formula.txt`) — this version recalculates on demand for a single row (e.g. from a button or menu item) instead of running live as a per-row formula.

## Sheet structure

| Column | Purpose |
|---|---|
| A — Status/Contract exp. | The date something expires (contract or underlying immigration status) |
| B — Service | Case category + package type + which date is expiring (see key below) |
| C — Rush Type | `Rush Fee 30%`, `Rush Fee 20%`, or `No Rush Fee` |
| D — Doc Submission Date | Computed output: the deadline to submit documents |

A reference block elsewhere on the sheet lists the year's holidays (Memorial Day, July 4th, Columbus Day, Thanksgiving, year-end recess) for staff to cross-check manually.

## Apps Script — `calculateDeadline.gs`

`calculateDeadlineRow2()` reads columns A–C from row 2, matches the case category/package/rush-tier combination against an ordered rule set, and writes the resulting date into column D. Each rule walks backward a fixed number of business days from the expiration date (skipping weekends and holidays), with an extra 7 or 10 day lookback for "status expiring" cases versus "contract expiring" cases.

See [`calculateDeadline.gs`](./calculateDeadline.gs) for the full script and every rule's day offset.

## Case Category Key

Genericized consistently with the rest of this account's Google Sheets repos ([google-sheets-formulas](https://github.com/joe85black/google-sheets-formulas), [client-case-scheduler](https://github.com/joe85black/client-case-scheduler)):

| Placeholder | Stands in for |
|---|---|
| Category A | Green-card-track case |
| Category B | Removal-of-conditions case |
| Category C (+ (Dependents)) | Visitor-visa case, optionally with dependents |
| Category D (+ (Dependents)) | Student-visa case, optionally with dependents |
| Category E | Citizenship case |
| Package Type 1 | Economic (lower-cost) filing package |
| Package Type 2 | Full filing package |
| Contract Expiring | The service contract itself is expiring |
| Status Expiring / Underlying Status Expiring | The client's current immigration status is expiring |

## Sample data

[`sample-data/deadlines-sample.csv`](./sample-data/deadlines-sample.csv) has 18 fabricated example rows covering every rule branch — each rush-fee tier, category, package type, and dependents/status/contract variant — with the column D result already computed, so you can see the rule set's output without needing to run the script yourself. The last two rows demonstrate holiday handling: one deadline is pushed back across Thanksgiving, and one crosses the Dec 22 – Jan 2 year-end closure block.

## Setup

1. Create a new Google Sheet with columns A–D as above.
2. Extensions > Apps Script, paste in [`calculateDeadline.gs`](./calculateDeadline.gs).
3. Fill in row 2 with a date, service/category string, and rush type, then run `calculateDeadlineRow2` (or wire it to a menu item/button) to populate column D.
