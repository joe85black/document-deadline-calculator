/**
 * Tests for src/DeadlineCalculator.gs
 * Run with: npm test   (Node 18+, no dependencies)
 */
'use strict';

// The script's project time zone in these tests. Set before any Date is created.
process.env.TZ = 'America/New_York';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript, sampleTableRows, ymd, dayNumberToYmd, colNumber } = require('./helpers');

const { api, D } = loadScript();
const TABLE = api.parseDeadlineTable_(sampleTableRows(), colNumber('J'));

const MON_FRI = 'Monday, Tuesday, Wednesday, Thursday, Friday';
// Every holiday except Good Friday, Juneteenth and Election Day.
const MOST_HOLIDAYS = [
  "New Year's Day", 'Martin Luther King Jr. Day', "Presidents' Day", 'Memorial Day',
  'Independence Day', 'Labor Day', "Columbus Day / Indigenous Peoples' Day", 'Veterans Day',
  'Thanksgiving Day', 'Day after Thanksgiving', 'Christmas Eve', 'Christmas Day', "New Year's Eve",
].join(', ');

/** Runs the calculation with sensible defaults; dates as [year, monthIndex, day]. */
function run(overrides) {
  const input = Object.assign({
    expiration: new D(2027, 0, 1),
    expiringType: 'Contract Expiring',
    rushFee: 'No Rush Fee',
    workDays: MON_FRI,
    holidays: '',
    closures: [],
    table: TABLE,
  }, overrides);
  return api.computeDeadline_(input);
}

function closure(from, to) {
  return api.parseClosures_([[new D(...from), to ? new D(...to) : null]]);
}

// ---------------------------------------------------------------------------
// Worked scenarios (dates checked by hand against a calendar)
// ---------------------------------------------------------------------------

const scenarios = [
  {
    name: 'standard deadline, four year-end holidays',
    input: { service: 'Starter Online', expiringType: 'Status Expiring',
             holidays: "New Year's Eve, New Year's Day, Christmas Day, Christmas Eve" },
    expected: '2026-11-17',
  },
  { name: 'standard deadline, Thanksgiving also closed',
    input: { service: 'Starter Online', holidays: MOST_HOLIDAYS }, expected: '2026-11-13' },
  { name: 'Rush Fee 20%',
    input: { service: 'Starter Online', rushFee: 'Rush Fee 20%', holidays: MOST_HOLIDAYS }, expected: '2026-12-01' },
  { name: 'Rush Fee 30%',
    input: { service: 'Starter Online', rushFee: 'Rush Fee 30%', holidays: MOST_HOLIDAYS }, expected: '2026-12-08' },
  { name: 'longer service, Rush Fee 30%',
    input: { service: 'Starter Mail-In', rushFee: 'Rush Fee 30%', holidays: MOST_HOLIDAYS }, expected: '2026-11-20' },
  { name: 'longer service, standard deadline (crosses Veterans Day)',
    input: { service: 'Starter Mail-In', holidays: MOST_HOLIDAYS }, expected: '2026-11-05' },
  { name: 'year-end closure range',
    input: { service: 'Starter Mail-In', holidays: MOST_HOLIDAYS + ', Good Friday',
             closures: closure([2026, 11, 19], [2027, 0, 3]) },
    expected: '2026-10-28' },
  { name: 'blank rush fee means No Rush Fee',
    input: { service: 'Starter Online', rushFee: '', holidays: MOST_HOLIDAYS }, expected: '2026-11-13' },
  { name: 'Saturday as a work day',
    input: { service: 'Quick Check', rushFee: 'Rush Fee 30%', expiration: new D(2027, 0, 29),
             workDays: MON_FRI + ', Saturday' },
    expected: '2027-01-18' },
  { name: 'holiday on a Saturday is observed the Friday before',
    input: { service: 'Quick Check', rushFee: 'Rush Fee 30%', expiration: new D(2026, 6, 17),
             holidays: 'Independence Day' },
    expected: '2026-07-02' },
  { name: "New Year's Day on a Saturday is observed on Dec 31 of the year before",
    input: { service: 'Quick Check', rushFee: 'Rush Fee 30%', expiration: new D(2028, 0, 14),
             holidays: "New Year's Day" },
    expected: '2027-12-30' },
  { name: 'calendar days (Status column, 45C)',
    input: { service: 'Records Archive', expiringType: 'Status Expiring' }, expected: '2026-11-17' },
  { name: 'calendar days landing on a closed day move earlier (Contract column, 30C)',
    input: { service: 'Records Archive', closures: closure([2026, 10, 30], [2026, 11, 4]) }, expected: '2026-11-27' },
  { name: 'closure end date blank means a single day',
    input: { service: 'Quick Check', rushFee: 'Rush Fee 30%', expiration: new D(2027, 0, 29),
             closures: closure([2027, 0, 15]) },
    expected: '2027-01-14' },
  // README examples
  { name: 'README: business days with no holidays (30B)',
    input: { service: 'Starter Online' }, expected: '2026-11-20' },
  { name: 'README: Monday-Friday week (10B)',
    input: { service: 'Quick Check', rushFee: 'Rush Fee 30%', expiration: new D(2027, 0, 29) }, expected: '2027-01-15' },
  { name: 'README: Independence Day not selected',
    input: { service: 'Quick Check', rushFee: 'Rush Fee 30%', expiration: new D(2026, 6, 17) }, expected: '2026-07-03' },
];

for (const s of scenarios) {
  test(`scenario: ${s.name}`, () => {
    const result = run(s.input);
    assert.equal(result.error, undefined, `unexpected error: ${result.error}`);
    assert.equal(ymd(result.date), s.expected);
  });
}

// ---------------------------------------------------------------------------
// Messages shown in the result cell
// ---------------------------------------------------------------------------

test('rush fee not offered for a service', () => {
  assert.equal(run({ service: 'Business Plus', rushFee: 'Rush Fee 30%' }).error,
    'Rush Fee 30% is not offered for Business Plus (Contract Expiring)');
  assert.equal(run({ service: 'Annual Review', rushFee: 'Rush Fee 20%', expiringType: 'Status Expiring' }).error,
    'Rush Fee 20% is not offered for Annual Review (Status Expiring)');
});

test('incomplete inputs show a plain "-"', () => {
  for (const result of [run({ service: 'Starter Online', expiration: null }), run({ service: '' })]) {
    assert.equal(result.error, '-');
    assert.equal(result.blank, true);
  }
});

test('missing expiration type asks for one', () => {
  assert.match(run({ service: 'Starter Online', expiringType: '' }).error, /^Choose Contract Expiring or Status Expiring/);
});

test('unknown inputs are named in the message', () => {
  assert.match(run({ service: 'Nope' }).error, /^Service not found in the deadlines table: Nope/);
  assert.match(run({ service: 'Starter Online', workDays: 'Mondy' }).error, /^Unknown work day in B9: Mondy/);
  assert.match(run({ service: 'Starter Online', holidays: 'Flag Day' }).error, /^Unknown holiday in B10: Flag Day/);
  assert.match(run({ service: 'Starter Online', rushFee: 'Rush Fee 50%' }).error, /^Unknown rush fee option/);
});

test('unreadable deadline cells are reported', () => {
  const table = api.parseDeadlineTable_([['X', 'abc', 2.5, '', '', '', '']], colNumber('J'));
  assert.match(run({ table, service: 'X', expiringType: 'Status Expiring' }).error, /Can't read the deadline "abc"/);
  assert.match(run({ table, service: 'X' }).error, /Can't read the deadline "2.5"/);
});

test('matching is case- and space-insensitive', () => {
  const result = run({ service: '  starter ONLINE ', expiringType: 'contract expiring', rushFee: 'rush fee 30%' });
  assert.equal(ymd(result.date), '2026-12-11');
});

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

test('deadline cell formats', () => {
  assert.equal(api.parseDeadline_(''), null);
  assert.equal(api.parseDeadline_('  '), null);
  assert.equal(JSON.stringify(api.parseDeadline_('30B')), JSON.stringify({ days: 30, calendar: false }));
  assert.equal(JSON.stringify(api.parseDeadline_('30 c')), JSON.stringify({ days: 30, calendar: true }));
  assert.equal(JSON.stringify(api.parseDeadline_(12)), JSON.stringify({ days: 12, calendar: false }));
  assert.equal(api.parseDeadline_(-3).invalid, true);
});

test('holiday dates for 2026', () => {
  const expected = {
    "New Year's Day": '2026-01-01', 'Martin Luther King Jr. Day': '2026-01-19', "Presidents' Day": '2026-02-16',
    'Good Friday': '2026-04-03', 'Memorial Day': '2026-05-25', 'Juneteenth': '2026-06-19',
    'Independence Day': '2026-07-04', 'Labor Day': '2026-09-07', "Columbus Day / Indigenous Peoples' Day": '2026-10-12',
    'Election Day': '2026-11-03', 'Veterans Day': '2026-11-11', 'Thanksgiving Day': '2026-11-26',
    'Day after Thanksgiving': '2026-11-27', 'Christmas Eve': '2026-12-24', 'Christmas Day': '2026-12-25',
    "New Year's Eve": '2026-12-31',
  };
  const rules = api.parseHolidays_(Object.keys(expected).join(', ')).rules;
  assert.equal(rules.length, Object.keys(expected).length);
  for (const rule of rules) assert.equal(ymd(rule.date(2026)), expected[rule.name], rule.name);
});

test('Easter Sunday', () => {
  assert.equal(ymd(api.easterSunday_(2025)), '2025-04-20');
  assert.equal(ymd(api.easterSunday_(2026)), '2026-04-05');
  assert.equal(ymd(api.easterSunday_(2027)), '2027-03-28');
});

test('closure rows: blank end = one day, reversed dates are swapped', () => {
  const [single, reversed] = api.parseClosures_([
    [new D(2027, 0, 15), null],
    [new D(2027, 0, 10), new D(2027, 0, 5)],
  ]);
  assert.equal(single.start, single.end);
  assert.ok(reversed.start < reversed.end);
});

// ---------------------------------------------------------------------------
// Whole-sheet behaviour (fake spreadsheet)
// ---------------------------------------------------------------------------

/** Fills the fake calculator tab with the sample table and the given inputs. */
function fillSheet(calc) {
  sampleTableRows().forEach((row, i) =>
    row.forEach((v, j) => calc.getRange(3 + i, colNumber('J') + j).setValue(v)));
  calc.set('B2', 'Starter Online');
  calc.set('C2', 'Contract Expiring');
  calc.set('D2', 'No Rush Fee');
  calc.set('B9', MON_FRI);
  calc.set('B10', MOST_HOLIDAYS);
}

test('calculateDeadline writes a date even when sheet and script time zones differ', () => {
  // Spreadsheet in London, script in New York: a date cell holding midnight
  // in London is 7 pm the day before in New York.
  const { api: sheetApi, D: SD, calc } = loadScript({ spreadsheetTimeZone: 'Europe/London' });
  fillSheet(calc);
  calc.set('A2', new SD(Date.UTC(2027, 0, 1, 0)));   // Jan 1 2027, 00:00 in London (UTC+0 in winter)
  sheetApi.calculateDeadline();
  assert.equal(typeof calc.get('E2'), 'number');
  assert.equal(dayNumberToYmd(calc.get('E2')), '2026-11-13');
  assert.equal(calc.numberFormat, 'mm/dd/yyyy');
});

test('calculateDeadline writes errors in red and "-" in the default colour', () => {
  const { D: SD, calc, api: sheetApi } = loadScript();
  fillSheet(calc);
  calc.set('A2', new SD(2027, 0, 1));
  calc.set('B2', 'Business Plus');
  calc.set('D2', 'Rush Fee 30%');
  sheetApi.calculateDeadline();
  assert.equal(calc.get('E2'), 'Rush Fee 30% is not offered for Business Plus (Contract Expiring)');
  assert.equal(calc.fontColor, '#cc0000');

  calc.set('A2', '');
  sheetApi.calculateDeadline();
  assert.equal(calc.get('E2'), '-');
  assert.equal(calc.fontColor, null);
});

test('closures are read from G:H', () => {
  const { D: SD, calc, api: sheetApi } = loadScript();
  fillSheet(calc);
  calc.set('A2', new SD(2027, 0, 1));
  calc.set('B2', 'Starter Mail-In');
  calc.set('B10', MOST_HOLIDAYS);
  calc.set('G2', new SD(2026, 11, 19));
  calc.set('H2', new SD(2027, 0, 3));
  sheetApi.calculateDeadline();
  assert.equal(dayNumberToYmd(calc.get('E2')), '2026-10-28');
});

test('onEdit before setupLists does not create the Lists tab', () => {
  const { calc, sheets, api: sheetApi } = loadScript();
  fillSheet(calc);
  sheetApi.onEdit({ range: calc.getRange('J3') });
  assert.deepEqual(sheets.map(s => s.name), ['Calculator']);
});

test('setupLists builds the Lists tab and dropdowns; new services appear on edit', () => {
  const { calc, sheets, api: sheetApi } = loadScript();
  fillSheet(calc);
  sheetApi.setupLists();
  const lists = sheets.find(s => s.name === 'Lists');
  assert.ok(lists, 'Lists tab created');
  assert.deepEqual(lists.getRange(1, 1, 1, 5).getValues()[0],
    ['Services', 'Rush Fee', 'Work Days', 'Holidays', 'Expiring']);
  assert.equal(lists.get('A2'), 'Starter Online');
  assert.equal(lists.get('C2'), 'Sunday');
  assert.equal(lists.get('D17'), "New Year's Eve");

  // Dropdowns: B2 -> Services, C2 -> Expiring, D2 -> Rush Fee
  assert.equal(calc.validations['2,2'].col, 1);
  assert.equal(calc.validations['2,3'].col, 5);
  assert.equal(calc.validations['2,4'].col, 2);

  // Adding a service to the table refreshes the list
  const newRow = 3 + sampleTableRows().length;
  calc.getRange(newRow, colNumber('J')).setValue('Premium Support');
  sheetApi.onEdit({ range: calc.getRange(newRow, colNumber('J')) });
  const services = lists.getRange(2, 1, 20, 1).getValues().map(r => r[0]).filter(Boolean);
  assert.equal(services[services.length - 1], 'Premium Support');
});

test('edits on other tabs are ignored', () => {
  const { calc, sheets, api: sheetApi } = loadScript();
  fillSheet(calc);
  sheetApi.setupLists();
  calc.set('E2', 'untouched');
  sheetApi.onEdit({ range: sheets.find(s => s.name === 'Lists').getRange('A2') });
  assert.equal(calc.get('E2'), 'untouched');
});
