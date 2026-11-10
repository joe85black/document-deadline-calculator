# Changelog

## 2.0.0

A rewrite that moves every rule out of the code and into the sheet.

### Added
- **Deadlines table:** deadlines are read from a table in the sheet (`J:P`), with separate Status and Contract columns for each rush tier. A blank cell means the option isn't offered.
- **Business and calendar days:** `30B` means business days and `30C` means calendar days.
- **Separate Contract/Status choice:** a `Contract Expiring` / `Status Expiring` dropdown (`C2`), kept apart from the service name.
- **Configurable work days** (`B9`), any combination of Sunday through Saturday.
- **Selectable holidays** (`B10`) from 16 U.S. holidays, including Good Friday (based on Easter) and the federal observed-weekday rule.
- **Closure ranges** in `G:H`. A blank end date means a single day.
- **Clear result messages:** for options that aren't offered, missing inputs, unknown values, and table cells that can't be read.
- **`setupLists()`:** builds a `Lists` tab and the dropdowns. The service list refreshes when the table changes.
- **Automatic recalculation** on every edit (`onEdit`). The button runs `calculateDeadline()`.
- **Automated tests** (`npm test`), run in CI.

### Changed
- The entry point is renamed from `calculateDeadlineRow2()` to `calculateDeadline()`.
- The result moves to `E2`, rush fee to `D2`, and closures to `G:H`.
- The fixed Dec 22 – Jan 2 year-end block is replaced by closure ranges you set in the sheet.

### Fixed
- Dates are read in the spreadsheet's time zone and written as a sheet day number. This stops results shifting by a day when the script and spreadsheet time zones differ.

## 1.0.0

- First version: a fixed rule set for a single row, with built-in holidays and a year-end closure block.
