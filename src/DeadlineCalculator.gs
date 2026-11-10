/**
 * ================================================================
 *  DEADLINES CALCULATOR  (Google Apps Script)
 * ================================================================
 * Works out the latest date a client can get started so we can finish
 * before their status or contract expires.
 *
 * HOW IT WORKS
 *   Start-by date = expiration date minus the deadline from the table,
 *   counting back only the days the business is open. A day is closed if:
 *     - it isn't one of the work days chosen in B9,
 *     - it's one of the holidays chosen in B10, or
 *     - it falls inside a closure listed in G:H.
 *   E2 recalculates by itself whenever the sheet is edited.
 *
 * CALCULATOR TAB
 *   A2    Expiration date (status or contract)
 *   B2    Service                             dropdown (built from the table's service column)
 *   C2    Contract Expiring / Status Expiring dropdown
 *   D2    Rush fee                            dropdown (blank = No Rush Fee)
 *   E2    RESULT: the start-by date, or a message saying what's wrong
 *   B9    Work days                           multi-select dropdown (blank = Monday-Friday)
 *   B10   Holidays the business closes for    multi-select dropdown
 *   G2:G  Closure start date
 *   H2:H  Closure end date (leave blank for a single day)
 *
 * DEADLINES TABLE (same tab, J1:P)
 *   J      Service name
 *   K / L  Standard deadline      (Status / Contract)
 *   M / N  Rush fee 20% deadline  (Status / Contract)
 *   O / P  Rush fee 30% deadline  (Status / Contract)
 *   "30B" = 30 business days, "30C" = 30 calendar days,
 *   a plain whole number = business days, blank = option not offered.
 *
 * FIRST-TIME SETUP
 *   1. In the Apps Script editor, pick setupLists in the function dropdown
 *      and click Run (approve the permissions prompt the first time).
 *      It builds the "Lists" tab and the dropdowns for B2, C2 and D2.
 *   2. Point the B9 dropdown at Lists!C2:C8 and B10 at Lists!D2:D17, and
 *      tick "Allow multiple selections" (Apps Script can't switch that on).
 *
 * MOVING THINGS AROUND
 *   Every cell and column the script uses is in SETTINGS below. If you move
 *   something on the sheet, change it there; nothing else needs editing.
 */


// ================================================================
//  SETTINGS
// ================================================================

// ---- Tabs ----
const CALC_SHEET_NAME  = '';        // calculator tab; blank = the first tab
const TABLE_SHEET_NAME = '';        // deadlines table tab; blank = same tab as the calculator
const LISTS_SHEET_NAME = 'Lists';   // dropdown lists tab (built by setupLists)

// ---- Calculator cells ----
const CELLS = {
  expiration:   'A2',
  service:      'B2',
  expiringType: 'C2',
  rushFee:      'D2',
  result:       'E2',
  workDays:     'B9',
  holidays:     'B10',
};

// ---- Closures: one per row, start date and optional end date ----
const CLOSURES = {
  firstRow: 2,
  startCol: 'G',
  endCol:   'H',
};

// ---- Deadlines table ----
const TABLE = {
  firstRow:   3,     // first service row (the rows above are headers)
  serviceCol: 'J',
  // Which column holds the deadline for each rush fee option and expiring type.
  // These rush fee names are also the choices in the D2 dropdown.
  deadlineCols: {
    'No Rush Fee':  { Status: 'K', Contract: 'L' },
    'Rush Fee 20%': { Status: 'M', Contract: 'N' },
    'Rush Fee 30%': { Status: 'O', Contract: 'P' },
  },
};

// ---- Dropdown choices ----
const RUSH_OPTIONS = Object.keys(TABLE.deadlineCols);
const NO_RUSH = RUSH_OPTIONS[0];    // used when D2 is blank

// C2 dropdown text -> which side of the table it reads.
const EXPIRING_OPTIONS = {
  'Contract Expiring': 'Contract',
  'Status Expiring':   'Status',
};

// Order matters: it matches JavaScript's day numbers (0 = Sunday).
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_WORK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];   // used when B9 is blank

// ---- U.S. holidays (the choices for B10) ----
// date:     works out the holiday's date for a given year.
// observed: when the holiday lands on a weekend day you don't work, you're
//           closed the nearest weekday instead (Saturday -> Friday,
//           Sunday -> Monday), the same rule federal holidays use.
// Names must not contain commas: Sheets separates multi-select choices with commas.
const HOLIDAYS = [
  { name: "New Year's Day",                         date: y => new Date(y, 0, 1),   observed: true },
  { name: 'Martin Luther King Jr. Day',             date: y => nthWeekday_(y, 0, 1, 3) },                // 3rd Monday in January
  { name: "Presidents' Day",                        date: y => nthWeekday_(y, 1, 1, 3) },                // 3rd Monday in February
  { name: 'Good Friday',                            date: y => addDays_(easterSunday_(y), -2) },         // Friday before Easter
  { name: 'Memorial Day',                           date: y => lastWeekday_(y, 4, 1) },                  // last Monday in May
  { name: 'Juneteenth',                             date: y => new Date(y, 5, 19),  observed: true },
  { name: 'Independence Day',                       date: y => new Date(y, 6, 4),   observed: true },
  { name: 'Labor Day',                              date: y => nthWeekday_(y, 8, 1, 1) },                // 1st Monday in September
  { name: "Columbus Day / Indigenous Peoples' Day", date: y => nthWeekday_(y, 9, 1, 2) },                // 2nd Monday in October
  { name: 'Election Day',                           date: y => addDays_(nthWeekday_(y, 10, 1, 1), 1) },  // Tuesday after the 1st Monday in November
  { name: 'Veterans Day',                           date: y => new Date(y, 10, 11), observed: true },
  { name: 'Thanksgiving Day',                       date: y => nthWeekday_(y, 10, 4, 4) },               // 4th Thursday in November
  { name: 'Day after Thanksgiving',                 date: y => addDays_(nthWeekday_(y, 10, 4, 4), 1) },
  { name: 'Christmas Eve',                          date: y => new Date(y, 11, 24) },
  { name: 'Christmas Day',                          date: y => new Date(y, 11, 25), observed: true },
  { name: "New Year's Eve",                         date: y => new Date(y, 11, 31) },
];

// ---- Lists tab column order ----
// Work Days (C) and Holidays (D) must stay where they are, because the
// B9/B10 dropdowns are pointed at them by hand.
const LISTS_COLUMNS = ['Services', 'Rush Fee', 'Work Days', 'Holidays', 'Expiring'];

// Safety limit so a bad setup (for example, closures covering every day)
// can't make the script search forever. About 10 years.
const MAX_DAYS_TO_SEARCH = 3660;


// ================================================================
//  ENTRY POINTS  (the functions you can run or that run by themselves)
// ================================================================

/**
 * Runs automatically on every edit (a "simple trigger", so it needs no setup).
 * Edits on other tabs are ignored. If a service name in the table changed,
 * the service dropdown list is refreshed too.
 *
 * Note: deleting a whole row isn't an "edit" to Google, so after deleting a
 * service row, edit any cell (or run setupLists) to refresh the dropdown.
 */
function onEdit(e) {
  if (e && e.range) {
    const editedId = e.range.getSheet().getSheetId();
    const tableSheet = getTableSheet_();
    const onCalc = editedId === getCalcSheet_().getSheetId();
    const onTable = editedId === tableSheet.getSheetId();
    if (!onCalc && !onTable) return;
    if (onTable && rangeTouchesColumn_(e.range, TABLE.serviceCol)) refreshServiceList_();
  }
  calculateDeadline();
}

/**
 * Reads the inputs, works out the start-by date and writes it (or an error) to E2.
 * This is the function the "Calculate" button on the sheet runs.
 */
function calculateDeadline() {
  const sheet = getCalcSheet_();
  const timeZone = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const valueOf = cell => sheet.getRange(cell).getValue();

  const result = computeDeadline_({
    expiration:   sheetDate_(valueOf(CELLS.expiration), timeZone),
    service:      valueOf(CELLS.service),
    expiringType: valueOf(CELLS.expiringType),
    rushFee:      valueOf(CELLS.rushFee),
    workDays:     valueOf(CELLS.workDays),
    holidays:     valueOf(CELLS.holidays),
    closures:     readClosures_(sheet, timeZone),
    table:        readDeadlineTable_(getTableSheet_()),
  });

  writeResult_(sheet.getRange(CELLS.result), result);
}

/**
 * Run once from the Apps Script editor (and again any time you want to reset
 * the lists). Rebuilds the "Lists" tab from SETTINGS and the deadlines table,
 * then puts dropdowns on B2 (service), C2 (Contract/Status Expiring) and
 * D2 (rush fee).
 *
 * B9 and B10 are left alone because Apps Script can't turn on "Allow multiple
 * selections". Set those two up by hand (see FIRST-TIME SETUP at the top).
 */
function setupLists() {
  const lists = getListsSheet_(true);
  lists.clear();

  const values = {
    'Services':  [],   // filled from the deadlines table by refreshServiceList_()
    'Rush Fee':  RUSH_OPTIONS,
    'Work Days': WEEKDAYS,
    'Holidays':  HOLIDAYS.map(h => h.name),
    'Expiring':  Object.keys(EXPIRING_OPTIONS),
  };
  LISTS_COLUMNS.forEach(header => {
    const column = [header].concat(values[header]);
    lists.getRange(1, listsCol_(header), column.length, 1).setValues(column.map(v => [v]));
  });
  refreshServiceList_();
  lists.getRange(1, 1, 1, LISTS_COLUMNS.length).setFontWeight('bold');
  lists.autoResizeColumns(1, LISTS_COLUMNS.length);

  const calc = getCalcSheet_();
  const dropdown = (header, rows) => SpreadsheetApp.newDataValidation()
    .requireValueInRange(lists.getRange(2, listsCol_(header), rows, 1), true)
    .setAllowInvalid(false)
    .build();

  // Services gets the whole column so new services fit without re-running setup.
  calc.getRange(CELLS.service).setDataValidation(dropdown('Services', lists.getMaxRows() - 1));
  calc.getRange(CELLS.expiringType).setDataValidation(dropdown('Expiring', values['Expiring'].length));
  calc.getRange(CELLS.rushFee).setDataValidation(dropdown('Rush Fee', values['Rush Fee'].length));
}


// ================================================================
//  CALCULATION
//  These functions don't touch the spreadsheet, so they can be tested alone.
//  Each check returns either a result or { error: 'message for E2' }.
// ================================================================

/**
 * input: {
 *   expiration:   Date or null,
 *   service, expiringType, rushFee, workDays, holidays: cell values,
 *   closures:     [{ start, end }] from readClosures_(),
 *   table:        deadlines table from readDeadlineTable_(),
 * }
 * Returns { date } or { error }. { blank: true } means the inputs are just
 * incomplete, so E2 shows a plain "-" rather than a red error.
 */
function computeDeadline_(input) {
  if (!input.expiration || !String(input.service || '').trim()) return { error: '-', blank: true };

  const deadline = lookupDeadline_(input.table || {}, input.service, input.expiringType, input.rushFee);
  if (deadline.error) return deadline;

  const workDays = parseWorkDays_(input.workDays);
  if (workDays.error) return workDays;

  const holidays = parseHolidays_(input.holidays);
  if (holidays.error) return holidays;

  const isOpen = makeIsOpen_(workDays.set, holidays.rules, input.closures || []);
  return countBack_(input.expiration, deadline, isOpen);
}

/** Finds the deadline in the table. Returns { days, calendar } or { error }. */
function lookupDeadline_(table, service, expiringType, rushFee) {
  const serviceText = String(service).trim();
  const serviceKey = findKey_(Object.keys(table), serviceText);
  if (!serviceKey) return { error: 'Service not found in the deadlines table: ' + serviceText };

  const typeText = String(expiringType || '').trim();
  if (!typeText) return { error: 'Choose Contract Expiring or Status Expiring in ' + CELLS.expiringType };
  const typeLabel = findKey_(Object.keys(EXPIRING_OPTIONS), typeText);
  if (!typeLabel) return { error: 'Unknown option in ' + CELLS.expiringType + ': ' + typeText };

  const rushText = String(rushFee || '').trim() || NO_RUSH;
  const rushKey = findKey_(RUSH_OPTIONS, rushText);
  if (!rushKey) return { error: 'Unknown rush fee option in ' + CELLS.rushFee + ': ' + rushText };

  const cell = table[serviceKey][rushKey][EXPIRING_OPTIONS[typeLabel]];
  const what = serviceKey + ' (' + typeLabel + ')';
  const deadline = parseDeadline_(cell);
  if (!deadline) return { error: rushKey + ' is not offered for ' + what };
  if (deadline.invalid) {
    return { error: 'Can\'t read the deadline "' + cell + '" for ' + what + '. Use a format like 30B or 30C.' };
  }
  return deadline;
}

/**
 * Reads one deadline cell from the table.
 *   "30B" -> { days: 30, calendar: false }   (business days)
 *   "30C" -> { days: 30, calendar: true }    (calendar days)
 *   30    -> { days: 30, calendar: false }
 *   blank -> null (not offered); anything else -> { invalid: true }
 */
function parseDeadline_(cell) {
  if (cell === '' || cell == null) return null;
  if (typeof cell === 'number') {
    return Number.isInteger(cell) && cell >= 0 ? { days: cell, calendar: false } : { invalid: true };
  }
  const text = String(cell).trim();
  if (!text) return null;
  const match = text.match(/^(\d+)\s*([BC])?$/i);
  if (!match) return { invalid: true };
  return { days: Number(match[1]), calendar: (match[2] || '').toUpperCase() === 'C' };
}

/** B9 -> { set: Set of day numbers (0 = Sunday) } or { error }. Blank means Monday-Friday. */
function parseWorkDays_(cellValue) {
  const chosen = splitList_(cellValue);
  const set = new Set();
  for (const name of (chosen.length ? chosen : DEFAULT_WORK_DAYS)) {
    const day = findKey_(WEEKDAYS, name);
    if (!day) return { error: 'Unknown work day in ' + CELLS.workDays + ': ' + name };
    set.add(WEEKDAYS.indexOf(day));
  }
  return { set: set };
}

/** B10 -> { rules: [HOLIDAYS entries] } or { error }. */
function parseHolidays_(cellValue) {
  const names = HOLIDAYS.map(h => h.name);
  const rules = [];
  for (const name of splitList_(cellValue)) {
    const match = findKey_(names, name);
    if (!match) return { error: 'Unknown holiday in ' + CELLS.holidays + ': ' + name };
    rules.push(HOLIDAYS[names.indexOf(match)]);
  }
  return { rules: rules };
}

/** Builds the isOpen(date) check from the work days, holidays and closures. */
function makeIsOpen_(workDays, holidayRules, closures) {
  // Holiday dates are worked out once per year and reused.
  const cache = {};
  const holidaysIn = year => cache[year] || (cache[year] = holidayDatesForYear_(year, holidayRules, workDays));

  return date => {
    if (!workDays.has(date.getDay())) return false;
    const key = dateKey_(date);
    // Next year's list is checked too: New Year's Day on a Saturday is observed on Dec 31.
    if (holidaysIn(date.getFullYear()).has(key) || holidaysIn(date.getFullYear() + 1).has(key)) return false;
    const time = date.getTime();
    return !closures.some(c => time >= c.start && time <= c.end);
  };
}

/** The chosen holidays' dates in one year (plus observed weekdays), as date keys. */
function holidayDatesForYear_(year, rules, workDays) {
  const keys = new Set();
  for (const holiday of rules) {
    const date = holiday.date(year);
    keys.add(dateKey_(date));
    if (holiday.observed && !workDays.has(date.getDay())) {
      if (date.getDay() === 6) keys.add(dateKey_(addDays_(date, -1)));   // Saturday -> Friday
      if (date.getDay() === 0) keys.add(dateKey_(addDays_(date, 1)));    // Sunday -> Monday
    }
  }
  return keys;
}

/**
 * Counts back from the expiration date.
 *   Business days: step back one day at a time, counting only open days.
 *                  (The expiration date itself never counts, like WORKDAY().)
 *   Calendar days: jump back that many days; if that lands on a closed
 *                  day, move earlier to the last open day before it.
 * Returns { date } or { error }.
 */
function countBack_(expiration, deadline, isOpen) {
  const tooFar = { error: 'Could not find enough open days. Check the work days in ' + CELLS.workDays + ' and the closures.' };
  let date = new Date(expiration);

  if (deadline.calendar) {
    date = addDays_(date, -deadline.days);
    for (let steps = 0; !isOpen(date); steps++) {
      if (steps > MAX_DAYS_TO_SEARCH) return tooFar;
      date = addDays_(date, -1);
    }
  } else {
    let remaining = deadline.days;
    for (let steps = 0; remaining > 0; steps++) {
      if (steps > MAX_DAYS_TO_SEARCH) return tooFar;
      date = addDays_(date, -1);
      if (isOpen(date)) remaining--;
    }
  }
  return { date: date };
}


// ================================================================
//  READING AND WRITING THE SPREADSHEET
// ================================================================

function getCalcSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return (CALC_SHEET_NAME && ss.getSheetByName(CALC_SHEET_NAME)) || ss.getSheets()[0];
}

function getTableSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return (TABLE_SHEET_NAME && ss.getSheetByName(TABLE_SHEET_NAME)) || getCalcSheet_();
}

/** The Lists tab. Created only when createIfMissing is true; otherwise null if it doesn't exist. */
function getListsSheet_(createIfMissing) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(LISTS_SHEET_NAME) || (createIfMissing ? ss.insertSheet(LISTS_SHEET_NAME) : null);
}

/** Column number of a header on the Lists tab, e.g. 'Holidays' -> 4. */
function listsCol_(header) {
  return LISTS_COLUMNS.indexOf(header) + 1;
}

/** Rewrites the Services column on the Lists tab from the deadlines table. */
function refreshServiceList_() {
  const lists = getListsSheet_(false);
  if (!lists) return;   // setupLists() hasn't been run yet
  const col = listsCol_('Services');
  const services = Object.keys(readDeadlineTable_(getTableSheet_()));
  lists.getRange(2, col, lists.getMaxRows() - 1, 1).clearContent();
  if (services.length) lists.getRange(2, col, services.length, 1).setValues(services.map(s => [s]));
}

/**
 * Reads the deadlines table into:
 *   { 'Business Plus': { 'No Rush Fee': { Status: '25B', Contract: '25B' }, ... }, ... }
 * Every non-blank cell in the service column from TABLE.firstRow down counts
 * as a service, so keep that column empty below the table.
 */
function readDeadlineTable_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < TABLE.firstRow) return {};

  const letters = [TABLE.serviceCol];
  RUSH_OPTIONS.forEach(rush => {
    letters.push(TABLE.deadlineCols[rush].Status, TABLE.deadlineCols[rush].Contract);
  });
  const cols = letters.map(colNumber_);
  const firstCol = Math.min.apply(null, cols);
  const lastCol = Math.max.apply(null, cols);

  const rows = sheet
    .getRange(TABLE.firstRow, firstCol, lastRow - TABLE.firstRow + 1, lastCol - firstCol + 1)
    .getValues();
  return parseDeadlineTable_(rows, firstCol);
}

/** Turns raw table rows (starting at column number firstCol) into the table object. */
function parseDeadlineTable_(rows, firstCol) {
  const cellIn = (row, letter) => row[colNumber_(letter) - firstCol];
  const table = {};
  for (const row of rows) {
    const service = String(cellIn(row, TABLE.serviceCol) || '').trim();
    if (!service) continue;
    table[service] = {};
    for (const rush of RUSH_OPTIONS) {
      const cols = TABLE.deadlineCols[rush];
      table[service][rush] = { Status: cellIn(row, cols.Status), Contract: cellIn(row, cols.Contract) };
    }
  }
  return table;
}

/** Reads the closure rows into [{ start, end }] (times in ms, both days included). */
function readClosures_(sheet, timeZone) {
  const lastRow = sheet.getLastRow();
  if (lastRow < CLOSURES.firstRow) return [];
  const startCol = colNumber_(CLOSURES.startCol);
  const endCol = colNumber_(CLOSURES.endCol);
  const rows = sheet
    .getRange(CLOSURES.firstRow, startCol, lastRow - CLOSURES.firstRow + 1, endCol - startCol + 1)
    .getValues()
    .map(row => [sheetDate_(row[0], timeZone), sheetDate_(row[endCol - startCol], timeZone)]);
  return parseClosures_(rows);
}

/** [[startDate, endDate or null], ...] -> [{ start, end }]. A missing end date means a single day. */
function parseClosures_(rows) {
  const closures = [];
  for (const [start, end] of rows) {
    if (!start) continue;
    const last = end || start;
    // If the dates were typed in the wrong order, swap them rather than ignore the row.
    closures.push({
      start: Math.min(start.getTime(), last.getTime()),
      end:   Math.max(start.getTime(), last.getTime()),
    });
  }
  return closures;
}

/**
 * Turns a cell value into a plain calendar date (midnight), or null.
 * Date cells are read in the spreadsheet's own time zone, so the day can't
 * shift if the Apps Script project is set to a different time zone.
 */
function sheetDate_(value, timeZone) {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const [y, m, d] = Utilities.formatDate(value, timeZone, 'yyyy-M-d').split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  if (value === '' || value == null) return null;
  // Text typed into the cell, e.g. "1/29/2027".
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

/** Writes the result to E2: the date in black, or the message (red for real errors). */
function writeResult_(cell, result) {
  if (result.date) {
    // Written as a spreadsheet day number, so no time zone conversion can shift the day.
    cell.setValue(toSheetDayNumber_(result.date)).setNumberFormat('mm/dd/yyyy').setFontColor(null);
  } else {
    cell.setValue(result.error).setFontColor(result.blank ? null : '#cc0000');
  }
}

/** Date -> the day number Sheets uses internally (days since Dec 30, 1899). */
function toSheetDayNumber_(date) {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

/** True if a range includes the given column letter. */
function rangeTouchesColumn_(range, letter) {
  const col = colNumber_(letter);
  return range.getColumn() <= col && range.getLastColumn() >= col;
}


// ================================================================
//  SMALL HELPERS
// ================================================================

/** Column letter -> number: "A" -> 1, "P" -> 16, "AA" -> 27. */
function colNumber_(letter) {
  return String(letter).toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

/** Splits a multi-select cell ("Monday, Tuesday") into trimmed names. */
function splitList_(value) {
  return String(value || '').split(',').map(s => s.trim()).filter(Boolean);
}

/** Finds value in a list ignoring upper/lower case and extra spaces. Returns the list's spelling, or null. */
function findKey_(keys, value) {
  const wanted = String(value).trim().toLowerCase();
  return keys.find(k => k.toLowerCase() === wanted) || null;
}

/** A Date as a "year-month-day" text key, for fast holiday look-ups. */
function dateKey_(date) {
  return date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate();
}

/** A new Date n days after (or before, if n is negative) the given one. */
function addDays_(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/** The nth (1 = first) weekday of a month. weekday: 0 = Sunday; month: 0 = January. */
function nthWeekday_(year, month, weekday, n) {
  const d = new Date(year, month, 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  d.setDate(d.getDate() + 7 * (n - 1));
  return d;
}

/** The last given weekday of a month. weekday: 0 = Sunday; month: 0 = January. */
function lastWeekday_(year, month, weekday) {
  const d = new Date(year, month + 1, 0);   // day 0 of next month = last day of this month
  while (d.getDay() !== weekday) d.setDate(d.getDate() - 1);
  return d;
}

/** Easter Sunday for a year (standard Gregorian calculation; used for Good Friday). */
function easterSunday_(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}
