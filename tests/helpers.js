/**
 * Test helpers: loads the Apps Script file into a Node sandbox with small
 * stand-ins for the Google services it uses (SpreadsheetApp, Utilities).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SCRIPT_PATH = path.join(__dirname, '..', 'src', 'DeadlineCalculator.gs');
const TABLE_CSV_PATH = path.join(__dirname, '..', 'sample-data', 'deadline-table.csv');

/** Column letter -> number ("A" -> 1). */
function colNumber(letter) {
  return letter.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

/**
 * A minimal in-memory sheet that supports the Range calls the script makes.
 * Cells are stored by [row][col] (both 1-based).
 */
function createSheet(name, id) {
  const cells = {};
  const sheet = {
    name,
    id,
    validations: {},
    numberFormat: null,
    fontColor: null,
    getName: () => name,
    getSheetId: () => id,
    getMaxRows: () => 1000,
    getLastRow: () => Math.max(0, ...Object.keys(cells)
      .filter(r => Object.values(cells[r]).some(v => v !== '' && v != null))
      .map(Number)),
    clear: () => { for (const r of Object.keys(cells)) delete cells[r]; },
    autoResizeColumns: () => {},
    getRange: (a, b, c, d) => {
      let row, col, numRows = 1, numCols = 1;
      if (typeof a === 'string') {
        const m = a.match(/^([A-Z]+)(\d+)$/);
        col = colNumber(m[1]);
        row = Number(m[2]);
      } else {
        row = a; col = b; numRows = c || 1; numCols = d || 1;
      }
      const get = (r, cc) => (cells[r] || {})[cc] ?? '';
      const put = (r, cc, v) => { (cells[r] = cells[r] || {})[cc] = v; };
      const range = {
        getValue: () => get(row, col),
        getValues: () => Array.from({ length: numRows }, (_, i) =>
          Array.from({ length: numCols }, (_, j) => get(row + i, col + j))),
        setValue: v => { put(row, col, v); return range; },
        setValues: rows => { rows.forEach((r, i) => r.forEach((v, j) => put(row + i, col + j, v))); return range; },
        clearContent: () => {
          for (let i = 0; i < numRows; i++) for (let j = 0; j < numCols; j++) put(row + i, col + j, '');
          return range;
        },
        setNumberFormat: f => { sheet.numberFormat = f; return range; },
        setFontColor: c => { sheet.fontColor = c; return range; },
        setFontWeight: () => range,
        setDataValidation: rule => { sheet.validations[`${row},${col}`] = rule; return range; },
        getColumn: () => col,
        getLastColumn: () => col + numCols - 1,
        getSheet: () => sheet,
        _row: row, _col: col, _numRows: numRows,
      };
      return range;
    },
  };
  sheet.set = (a1, value) => sheet.getRange(a1).setValue(value);
  sheet.get = a1 => sheet.getRange(a1).getValue();
  return sheet;
}

/**
 * Loads the script. Returns:
 *   api   - the sandbox; every top-level function in the script is on it
 *   D     - the sandbox's Date constructor. Build test dates with it, because
 *           the script's `instanceof Date` checks only recognise dates from
 *           its own sandbox.
 *   calc  - the fake calculator tab; sheets - all fake tabs
 * spreadsheetTimeZone: the time zone the fake spreadsheet reports.
 */
function loadScript({ spreadsheetTimeZone = 'America/New_York' } = {}) {
  const sheets = [createSheet('Calculator', 1)];
  const spreadsheet = {
    getSpreadsheetTimeZone: () => spreadsheetTimeZone,
    getSheets: () => sheets,
    getSheetByName: n => sheets.find(s => s.name === n) || null,
    insertSheet: n => { const s = createSheet(n, sheets.length + 1); sheets.push(s); return s; },
  };
  const sandbox = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => spreadsheet,
      newDataValidation: () => {
        const builder = {
          requireValueInRange: r => { builder.range = r; return builder; },
          setAllowInvalid: () => builder,
          build: () => ({ col: builder.range._col, row: builder.range._row, rows: builder.range._numRows }),
        };
        return builder;
      },
    },
    Utilities: {
      // Only the 'yyyy-M-d' pattern is used by the script.
      formatDate: (date, timeZone) => {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
          timeZone, year: 'numeric', month: 'numeric', day: 'numeric',
        }).formatToParts(date).map(p => [p.type, p.value]));
        return `${parts.year}-${parts.month}-${parts.day}`;
      },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(SCRIPT_PATH, 'utf8'), sandbox, { filename: 'DeadlineCalculator.gs' });
  return { api: sandbox, D: vm.runInContext('Date', sandbox), sheets, calc: sheets[0] };
}

/** Rows of the sample deadline table (header row removed). */
function sampleTableRows() {
  return fs.readFileSync(TABLE_CSV_PATH, 'utf8').trim().split(/\r?\n/).slice(1).map(line => line.split(','));
}

/** Date -> "YYYY-MM-DD" using local date parts. */
function ymd(date) {
  const p = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Sheets day number -> "YYYY-MM-DD". */
function dayNumberToYmd(n) {
  return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10);
}

module.exports = { loadScript, sampleTableRows, ymd, dayNumberToYmd, colNumber };
