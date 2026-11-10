# Document Deadline Calculator

[![Tests](https://github.com/joe85black/document-deadline-calculator/actions/workflows/test.yml/badge.svg)](https://github.com/joe85black/document-deadline-calculator/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A Google Apps Script for Google Sheets that works out the **latest date a client can start** so that work finishes before a status or contract expires.

You pick a package, a rush-fee tier and an expiration date. The script looks up how many days that package needs, then counts back from the expiration date. It skips weekends, holidays and any dates the business is closed.

You set everything from the sheet itself, so you don't have to edit the code:

| You set | Where | Details |
|---|---|---|
| Packages and their deadlines | Packages table, `J:P` | [The packages table](#the-packages-table) |
| How long each deadline is (`30B`, `30C`, …) | Cells of the packages table | [Deadline values](#deadline-values-30b-30c) |
| Which days of the week you work | `B9` | [Work days](#work-days) |
| Which holidays you close for | `B10` | [Holidays](#holidays) |
| One-off closures and date ranges | `G:H` | [Custom closure dates](#custom-closure-dates) |

> All package names, deadlines and dates in this repository are made-up examples.

---

## Quick look

| A: Expiration | B: Package | C: Expiration type | D: Rush fee | E: **Start-by date** |
|---|---|---|---|---|
| 01/01/2027 | Starter Online | Contract Expiring | No Rush Fee | **11/13/2026** |

`E2` updates whenever you edit the sheet. A **Calculate Deadline** button can also run it.

If a choice isn't possible, `E2` explains why in red instead of showing a date. For example:

> Rush Fee 30% is not offered for Business Plus (Contract Expiring)

---

## The packages table

Every package and its deadlines live in one table on the sheet (`J1:P`). Rows 1–2 are headers and packages start in row 3. Each rush-fee tier has two columns, because the deadline can differ depending on whether a **status** or a **contract** is expiring.

| J: Package | K: Standard<br>(Status) | L: Standard<br>(Contract) | M: Rush 20%<br>(Status) | N: Rush 20%<br>(Contract) | O: Rush 30%<br>(Status) | P: Rush 30%<br>(Contract) |
|---|---|---|---|---|---|---|
| Starter Online | 30B | 30B | 20B | 20B | 15B | 15B |
| Starter Online Lite | 30B | 30B | 20B | 20B | 15B | 15B |
| Starter Mail-In | 35B | 35B | 30B | 30B | 25B | 25B |
| Business Plus | 25B | 25B | 20B | 20B | — | — |
| Annual Review | 20B | 20B | — | — | — | — |
| Quick Check | 20B | 20B | — | — | 10B | 10B |
| Quick Check Family | 30B | 30B | — | — | 15B | 15B |
| Records Archive | 45C | 30C | — | — | — | — |

**—** means a blank cell, so that tier isn't offered for that package. The same table is in [`sample-data/deadline-table.csv`](sample-data/deadline-table.csv), ready to paste into `J3`.

How the table is used:

- **Package dropdown:** the `B2` dropdown is built from column J. Add a row and the new package appears in the dropdown after your next edit.
- **Changing deadlines:** change any cell and the next result uses the new value. There's no code to touch.
- **Choosing the column:** `C2` (Contract Expiring / Status Expiring) and `D2` (rush tier) together pick the column, and `B2` picks the row.

---

## Deadline values (`30B`, `30C`)

Each cell in the table says how many days before the expiration date the work has to start.

| Value | Meaning | Counting rule |
|---|---|---|
| `30B` | 30 **business** days | Count back one day at a time and count only open days. Weekends, chosen holidays and closures are skipped. |
| `30C` | 30 **calendar** days | Jump straight back 30 days. If that lands on a closed day, move earlier to the last open day. |
| `30` | Same as `30B` | A plain whole number counts as business days. |
| *blank* | Not offered | `E2` shows "… is not offered for …". |

The expiration date itself never counts as one of the days, which matches the `WORKDAY()` function. Anything else in a cell (such as `abc` or `2.5`) shows a "Can't read the deadline" message, so typos don't silently produce a wrong date.

**Business vs. calendar days, same expiration (Jan 1, 2027), Monday–Friday, no holidays:**

| Package | Expiration type | Deadline | Start-by date |
|---|---|---|---|
| Starter Online | Contract | `30B` | Fri 11/20/2026 (30 weekdays back) |
| Records Archive | Status | `45C` | Tue 11/17/2026 (45 days back, an open day) |

---

## Work days

`B9` is a **multi-select dropdown** listing Sunday through Saturday. Pick every day the business is open.

| `B9` | Effect |
|---|---|
| Monday, Tuesday, Wednesday, Thursday, Friday | Standard week: weekends are skipped |
| Monday … Saturday | Saturdays count as business days |
| Tuesday … Saturday | Sundays and Mondays are skipped |
| *(blank)* | Treated as Monday–Friday |

Work days also decide when a weekend holiday is moved to a weekday (see [observed holidays](#observed-holidays)).

**Example:** Quick Check with Rush Fee 30% (`10B`) and an expiration of Fri 1/29/2027:

- **Monday–Friday:** start by **Fri 1/15/2027**
- **Monday–Saturday:** start by **Mon 1/18/2027**, because Saturdays count too

---

## Holidays

`B10` is a **multi-select dropdown** of 16 U.S. holidays. Pick the ones the business closes for. The script works out each holiday's date for any year, so the list never needs updating.

| Holiday | Rule | 2026 | 2027 |
|---|---|---|---|
| New Year's Day | Jan 1 · observed | Thu 1/1 | Fri 1/1 |
| Martin Luther King Jr. Day | 3rd Monday in January | Mon 1/19 | Mon 1/18 |
| Presidents' Day | 3rd Monday in February | Mon 2/16 | Mon 2/15 |
| Good Friday | Friday before Easter | Fri 4/3 | Fri 3/26 |
| Memorial Day | Last Monday in May | Mon 5/25 | Mon 5/31 |
| Juneteenth | Jun 19 · observed | Fri 6/19 | Sat 6/19 → closed **Fri 6/18** |
| Independence Day | Jul 4 · observed | Sat 7/4 → closed **Fri 7/3** | Sun 7/4 → closed **Mon 7/5** |
| Labor Day | 1st Monday in September | Mon 9/7 | Mon 9/6 |
| Columbus Day / Indigenous Peoples' Day | 2nd Monday in October | Mon 10/12 | Mon 10/11 |
| Election Day | Tuesday after the 1st Monday in November | Tue 11/3 | Tue 11/2 |
| Veterans Day | Nov 11 · observed | Wed 11/11 | Thu 11/11 |
| Thanksgiving Day | 4th Thursday in November | Thu 11/26 | Thu 11/25 |
| Day after Thanksgiving | Friday after Thanksgiving | Fri 11/27 | Fri 11/26 |
| Christmas Eve | Dec 24 | Thu 12/24 | Fri 12/24 |
| Christmas Day | Dec 25 · observed | Fri 12/25 | Sat 12/25 → closed **Fri 12/24** |
| New Year's Eve | Dec 31 | Thu 12/31 | Fri 12/31 |

The "closed" dates shown assume a Monday–Friday week.

### Observed holidays

Holidays marked **observed** follow the federal rule. If the holiday falls on a weekend day you **don't** work, you're closed on the nearest weekday instead:

- **Saturday holiday:** closed the Friday before.
- **Sunday holiday:** closed the Monday after.
- **If you work that weekend day:** you're closed on the holiday itself, and no weekday is moved.
- **Across the year end:** New Year's Day on a Saturday (as in 2028) closes Friday, Dec 31 of the year before.

**Example:** Quick Check with Rush Fee 30% (`10B`), expiring Fri 7/17/2026:

- **Without Independence Day:** start by **Fri 7/3/2026**
- **With Independence Day:** start by **Thu 7/2/2026**, because July 4 is a Saturday so Fri 7/3 is closed

---

## Custom closure dates

Use columns **G** (start) and **H** (end) for any other days the business is closed: office moves, training days, a year-end shutdown, and so on. Add one closure per row from row 2 down.

| G: Start Date | H: End Date | Meaning |
|---|---|---|
| 12/19/2026 | 01/03/2027 | Closed for that whole range, both ends included |
| 11/02/2026 | *(blank)* | Closed for that single day |
| 03/15/2027 | 03/12/2027 | Dates typed in the wrong order are swapped, so this is Mar 12–15 |

How closures are treated:

- **Counting:** closed days are skipped for both business-day and calendar-day deadlines.
- **Overlaps:** a closure can overlap a weekend or a holiday without any problem.
- **Empty rows:** rows with no start date are ignored, so you can leave gaps.

**Example:** Starter Mail-In with Contract Expiring and No Rush Fee (`35B`), expiring Jan 1, 2027. The business works Monday–Friday, has Thanksgiving, Veterans Day and the Christmas/New Year holidays selected, and a closure from 12/19/2026 to 01/03/2027.

| Without the closure | With the closure |
|---|---|
| **11/05/2026** | **10/28/2026** |

The closure removes every weekday from Dec 21 to Dec 31, so the count starts on Fri Dec 18 and reaches day 35 on Wed Oct 28.

---

## Worked examples

All of these expire on **01/01/2027** with Monday–Friday work days. "Most holidays" means every holiday except Good Friday, Juneteenth and Election Day.

| Package | Expiration type | Rush fee | Holidays | Closures | Start-by date |
|---|---|---|---|---|---|
| Starter Online | Status | No Rush Fee | Christmas Eve, Christmas Day, New Year's Eve, New Year's Day | — | 11/17/2026 |
| Starter Online | Contract | No Rush Fee | Most holidays | — | 11/13/2026 |
| Starter Online | Contract | Rush Fee 20% | Most holidays | — | 12/01/2026 |
| Starter Online | Contract | Rush Fee 30% | Most holidays | — | 12/08/2026 |
| Starter Mail-In | Contract | Rush Fee 30% | Most holidays | — | 11/20/2026 |
| Starter Mail-In | Contract | No Rush Fee | Most holidays | — | 11/05/2026 |
| Starter Mail-In | Contract | No Rush Fee | Most holidays + Good Friday | 12/19/2026–01/03/2027 | 10/28/2026 |
| Business Plus | Contract | Rush Fee 30% | — | — | *Rush Fee 30% is not offered for Business Plus (Contract Expiring)* |

Every row is checked by the automated tests.

---

## Sheet layout

| Cell | Contents |
|---|---|
| `A2` | Status or contract expiration date |
| `B2` | Package (dropdown, built from the packages table) |
| `C2` | `Contract Expiring` or `Status Expiring` (dropdown) |
| `D2` | `No Rush Fee`, `Rush Fee 20%` or `Rush Fee 30%` (dropdown; blank = No Rush Fee) |
| `E2` | **Result:** the start-by date, or a message explaining what's missing |
| `B9` | Work days (multi-select dropdown) |
| `B10` | Holidays (multi-select dropdown) |
| `G2:G` / `H2:H` | Closure start / end dates |
| `J1:P` | Packages table |

### Messages in `E2`

| Message | Cause |
|---|---|
| `-` | The expiration date or package is still blank |
| Choose Contract Expiring or Status Expiring in C2 | `C2` is blank |
| Rush Fee 30% is not offered for … | That table cell is blank |
| Service not found in the deadlines table: … | `B2` doesn't match any package in column J |
| Unknown work day in B9 / Unknown holiday in B10: … | A typo in a multi-select cell |
| Can't read the deadline "…" | A table cell isn't `30B`, `30C`, a whole number or blank |

---

## Setup

1. **Lay out the sheet** as above, and paste your packages into `J3:P`. You can start from [`sample-data/deadline-table.csv`](sample-data/deadline-table.csv).
2. **Add the script.** Open **Extensions → Apps Script**, replace the contents of `Code.gs` with [`src/DeadlineCalculator.gs`](src/DeadlineCalculator.gs), and save.
3. **Build the dropdowns.** Choose `setupLists` in the function dropdown and click **Run**. Approve the permissions prompt the first time. This creates a `Lists` tab and adds dropdowns to `B2`, `C2` and `D2`.
4. **Set up the multi-select dropdowns.** Point `B9` at `Lists!C2:C8` and `B10` at `Lists!D2:D17`, and tick **Allow multiple selections**. (Apps Script can't turn this option on.)
5. **Add a button (optional).** Right-click a drawing or image → ⋮ → **Assign script** → `calculateDeadline`.

### Using clasp (optional)

[`src/`](src/) is laid out for [clasp](https://github.com/google/clasp). From inside `src/`, run `clasp create --type sheets` or `clasp clone <scriptId>`, then `clasp push`. Set the time zone in [`src/appsscript.json`](src/appsscript.json) to match your spreadsheet.

## Configuration

Every cell and column the script uses is defined in the `SETTINGS` section at the top of [`src/DeadlineCalculator.gs`](src/DeadlineCalculator.gs). If you move something on the sheet, change it there. Nothing else needs editing.

| Setting | Controls |
|---|---|
| `CALC_SHEET_NAME`, `TABLE_SHEET_NAME`, `LISTS_SHEET_NAME` | Which tabs are used (blank = first tab) |
| `CELLS` | Input and result cells |
| `CLOSURES` | Closure columns and first row |
| `TABLE` | Packages table position and which column holds each rush tier |
| `EXPIRING_OPTIONS` | Text of the Contract/Status choices |
| `DEFAULT_WORK_DAYS` | Work days used when `B9` is blank |
| `HOLIDAYS` | Holiday list and date rules |

To add a rush tier, add a line to `TABLE.deadlineCols` and the matching columns to the sheet, then run `setupLists` again.

Dates are read in the spreadsheet's own time zone and written as a sheet date number, so results can't shift by a day when the Apps Script project uses a different time zone.

## Development

The calculation logic doesn't touch the spreadsheet, so it runs in Node with small stand-ins for the Google services. No packages need installing.

```bash
npm test        # Node 18 or newer
```

The tests cover all of the worked examples above, every message, the holiday dates, observed holidays, closures, the time-zone handling, and `setupLists`/`onEdit` against a fake spreadsheet. They run on every push and pull request through GitHub Actions.

### Project structure

```
src/
  DeadlineCalculator.gs   The Apps Script (paste into the Sheet, or push with clasp)
  appsscript.json         Apps Script manifest for clasp
sample-data/
  deadline-table.csv      Example packages table (sheet range J3:P)
tests/
  deadline-calculator.test.js
  helpers.js              Loads the script with fake SpreadsheetApp/Utilities
.github/workflows/
  test.yml                Runs the tests in CI
```

See [CHANGELOG.md](CHANGELOG.md) for version history.

## License

[MIT](LICENSE)
