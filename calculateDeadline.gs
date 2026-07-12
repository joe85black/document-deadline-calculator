/**
 * Computes a document-submission deadline for row 2 of the active sheet,
 * based on a base date (column A), case category + package/expiration type
 * (column B), and rush-fee tier (column C) — writing the result into
 * column D.
 *
 * This is the Apps Script counterpart to the deadline logic already
 * published as a plain array formula in the Google-Sheets-Formulas repo
 * (see deadline-formula.txt there): same rule set and day offsets, but
 * triggered on demand for a single row instead of running live as a
 * per-row formula.
 *
 * Case-category / package-type labels are genericized placeholders
 * (Category A-E, Package Type 1-2) — see the Case Category Key in this
 * repo's README. Only the labels were changed; every day-offset and
 * rush-fee percentage is unchanged from the working script.
 */
function calculateDeadlineRow2() {
  let sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  let row = 2;  // always row 2
  let data = sheet.getRange(row, 1, 1, 3).getValues()[0]; // A,B,C
  let A = new Date(data[0]); // base date (contract/status expiration)
  let B = data[1];           // case category + package/expiration type
  let C = data[2];           // rush fee tier

  Logger.log("Row " + row + " values → A: " + A + " | B: " + B + " | C: " + C);

  // If no valid date, just write "-"
  if (isNaN(A.getTime())) {
    sheet.getRange(row, 4).setValue("-");
    return;
  }

  // ====== Helpers ======
  function shiftDays(base, days) {
    let d = new Date(base);
    d.setDate(d.getDate() + days);
    return d;
  }

  function getMemorialDay(year) {
    let d = new Date(year, 4, 31);
    while (d.getDay() !== 1) d.setDate(d.getDate() - 1);
    return d;
  }
  function getLaborDay(year) {
    let d = new Date(year, 8, 1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    return d;
  }
  function getColumbusDay(year) {
    let d = new Date(year, 9, 1), mondayCount = 0;
    while (true) {
      if (d.getDay() === 1) mondayCount++;
      if (mondayCount === 2) return d;
      d.setDate(d.getDate() + 1);
    }
  }
  function getThanksgiving(year) {
    let d = new Date(year, 10, 1);
    while (d.getDay() !== 4) d.setDate(d.getDate() + 1);
    d.setDate(d.getDate() + 21); // 4th Thursday
    let friday = new Date(d); friday.setDate(d.getDate() + 1);
    return [d, friday];
  }
  function getCustomHolidays(year) {
    return [
      getMemorialDay(year),
      getLaborDay(year),
      getColumbusDay(year),
      new Date(year, 6, 4),   // July 4
    ].concat(getThanksgiving(year));
  }

  function isWorkday(date) {
    let day = date.getDay();
    if (day === 0 || day === 6) return false;
    let year = date.getFullYear();
    let holidays = getCustomHolidays(year);

    // Dec 22 – Jan 2
    let holidayBlockStart = new Date(year, 11, 22);
    let holidayBlockEnd = new Date(year + 1, 0, 2);
    // Jan 1–2 belong to the block that started the previous December
    let prevBlockStart = new Date(year - 1, 11, 22);
    let prevBlockEnd = new Date(year, 0, 2);

    for (let h of holidays) {
      if (date.toDateString() === h.toDateString()) return false;
    }
    if (date >= holidayBlockStart && date <= holidayBlockEnd) return false;
    if (date >= prevBlockStart && date <= prevBlockEnd) return false;

    return true;
  }

  function customWorkday(startDate, offset) {
    let date = new Date(startDate);
    let step = offset > 0 ? 1 : -1;
    let remaining = Math.abs(offset);
    while (remaining > 0) {
      date.setDate(date.getDate() + step);
      if (isWorkday(date)) remaining--;
    }
    return date;
  }

  // ====== Rules ======
  let result = "-";

  // Rush Fee 30%
  if ((B === "Category A - Package Type 1 - Contract Expiring" && C === "Rush Fee 30%") ||
      (B === "Category B - Package Type 1 - Contract Expiring" && C === "Rush Fee 30%") ||
      (B === "Category A - Package Type 2 - Contract Expiring" && C === "Rush Fee 30%") ||
      (B === "Category B - Package Type 2 - Contract Expiring" && C === "Rush Fee 30%")) {
    result = customWorkday(A, -9);
  }
  else if ((B === "Category A - Package Type 1 - Status Expiring" && C === "Rush Fee 30%") ||
           (B === "Category B - Package Type 1 - Underlying Status Expiring" && C === "Rush Fee 30%")) {
    result = customWorkday(shiftDays(A, -7), -8);
  }
  else if ((B === "Category A - Package Type 2 - Status Expiring" && C === "Rush Fee 30%")) {
    result = customWorkday(shiftDays(A, -7), -9);
  }
  else if ((B === "Category C - Status Expiring / Contract Expiring" && C === "Rush Fee 30%") ||
           (B === "Category C (Dependents) - Contract Expiring" && C === "Rush Fee 30%") ||
           (B === "Category D - Status Expiring / Contract Expiring" && C === "Rush Fee 30%") ||
           (B === "Category B - Package Type 2 - Underlying Status Expiring" && C === "Rush Fee 30%")) {
    result = customWorkday(A, -6);
  }
  else if ((B === "Category C (Dependents) - Status Expiring" && C === "Rush Fee 30%")) {
    result = customWorkday(shiftDays(A, -7), -6);
  }
  else if ((B === "Category D (Dependents) - Status Expiring" && C === "Rush Fee 30%")) {
    result = customWorkday(shiftDays(A, -7), -5);
  }
  else if ((B === "Category D (Dependents) - Contract Expiring" && C === "Rush Fee 30%")) {
    result = customWorkday(A, -5);
  }

  // Rush Fee 20%
  else if ((B === "Category A - Package Type 1 - Contract Expiring" && C === "Rush Fee 20%") ||
           (B === "Category B - Package Type 1 - Contract Expiring" && C === "Rush Fee 20%") ||
           (B === "Category A - Package Type 2 - Contract Expiring" && C === "Rush Fee 20%") ||
           (B === "Category B - Package Type 2 - Contract Expiring" && C === "Rush Fee 20%")) {
    result = customWorkday(A, -13);
  }
  else if ((B === "Category A - Package Type 1 - Status Expiring" && C === "Rush Fee 20%") ||
           (B === "Category B - Package Type 1 - Underlying Status Expiring" && C === "Rush Fee 20%")) {
    result = customWorkday(shiftDays(A, -7), -12);
  }
  else if ((B === "Category A - Package Type 2 - Status Expiring" && C === "Rush Fee 20%")) {
    result = customWorkday(shiftDays(A, -7), -13);
  }
  else if ((B === "Category C - Status Expiring / Contract Expiring" && C === "Rush Fee 20%") ||
           (B === "Category D - Status Expiring / Contract Expiring" && C === "Rush Fee 20%") ||
           (B === "Category B - Package Type 2 - Underlying Status Expiring" && C === "Rush Fee 20%")) {
    result = customWorkday(A, -10);
  }
  else if ((B === "Category C (Dependents) - Status Expiring" && C === "Rush Fee 20%") ||
           (B === "Category D (Dependents) - Status Expiring" && C === "Rush Fee 20%")) {
    result = customWorkday(shiftDays(A, -7), -9);
  }
  else if ((B === "Category C (Dependents) - Contract Expiring" && C === "Rush Fee 20%") ||
           (B === "Category D (Dependents) - Contract Expiring" && C === "Rush Fee 20%")) {
    result = customWorkday(A, -9);
  }

  // No Rush Fee
  else if ((B === "Category A - Package Type 1 - Contract Expiring") ||
           (B === "Category B - Package Type 1 - Contract Expiring")) {
    result = customWorkday(A, -18);
  }
  else if ((B === "Category A - Package Type 1 - Status Expiring") ||
           (B === "Category B - Package Type 1 - Underlying Status Expiring")) {
    result = customWorkday(shiftDays(A, -10), -18);
  }
  else if ((B === "Category A - Package Type 2 - Contract Expiring") ||
           (B === "Category B - Package Type 2 - Contract Expiring")) {
    result = customWorkday(A, -20);
  }
  else if ((B === "Category A - Package Type 2 - Status Expiring")) {
    result = customWorkday(shiftDays(A, -10), -20);
  }
  else if ((B === "Category C - Status Expiring / Contract Expiring") ||
           (B === "Category C (Dependents) - Contract Expiring") ||
           (B === "Category D - Status Expiring / Contract Expiring") ||
           (B === "Category D (Dependents) - Contract Expiring") ||
           (B === "Category B - Package Type 2 - Underlying Status Expiring")) {
    result = customWorkday(A, -20);
  }
  else if ((B === "Category C (Dependents) - Status Expiring") ||
           (B === "Category D (Dependents) - Status Expiring")) {
    result = customWorkday(shiftDays(A, -10), -20);
  }
  else if (B === "Category E - Contract Expiring") {
    result = customWorkday(A, -18);
  }

  // ====== Write result ======
  sheet.getRange(row, 4).setValue(result); // column D
  Logger.log("Final result for row " + row + ": " + result);
}
