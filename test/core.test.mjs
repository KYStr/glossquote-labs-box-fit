import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateBoxFit } from '../public/js/core/calculate-box-fit.js';

const base = (overrides = {}) => ({ boxLengthRaw: '10', boxWidthRaw: '8', boxHeightRaw: '6', itemLengthRaw: '3', itemWidthRaw: '2', itemHeightRaw: '2', gapRaw: '0', allowRotation: false, ...overrides });
const requestOf = (box, item, gapRaw = '0', allowRotation = false) => ({ boxLengthRaw: box[0], boxWidthRaw: box[1], boxHeightRaw: box[2], itemLengthRaw: item[0], itemWidthRaw: item[1], itemHeightRaw: item[2], gapRaw, allowRotation });
// All counts, totals and occupied dimensions below are independent handwritten oracles.
// These helpers only spell out the fixed API shape; they perform no capacity calculation.
const axes = [['L', 'W', 'H'], ['L', 'H', 'W'], ['W', 'L', 'H'], ['W', 'H', 'L'], ['H', 'L', 'W'], ['H', 'W', 'L']];
const vector = values => ({ boxLength: values[0], boxWidth: values[1], boxHeight: values[2] });
const row = (index, counts, total, occupied) => ({ index, itemAxes: [...axes[index]], axesCounts: vector(counts), total, occupiedMm: occupied === null ? null : vector(occupied) });
const success = (orientations, winnerIndex, total, oneLayerCount, layerCount) => ({ ok: true, result: { schemaVersion: 1, orientations, winnerIndex, total, oneLayerCount, layerCount } });
const error = (code, field) => ({ ok: false, error: { code, field } });

test('C01 original LWH: 36 / 12 per layer / 3 layers', () => {
  assert.deepEqual(calculateBoxFit(base()), success([row(0, [3, 4, 3], '36', ['9.00', '8.00', '6.00'])], 0, '36', 12, 3));
});
test('C02 all six fixed orientations; earliest tied maximum WHL', () => {
  assert.deepEqual(calculateBoxFit(base({ allowRotation: true })), success([
    row(0, [3, 4, 3], '36', ['9.00', '8.00', '6.00']),
    row(1, [3, 4, 3], '36', ['9.00', '8.00', '6.00']),
    row(2, [5, 2, 3], '30', ['10.00', '6.00', '6.00']),
    row(3, [5, 4, 2], '40', ['10.00', '8.00', '6.00']),
    row(4, [5, 2, 3], '30', ['10.00', '6.00', '6.00']),
    row(5, [5, 4, 2], '40', ['10.00', '8.00', '6.00']),
  ], 3, '40', 20, 2));
});
test('C03 equal item axes retain six rows', () => {
  assert.deepEqual(calculateBoxFit(base({ itemLengthRaw: '2', allowRotation: true })), success(axes.map((_, index) => row(index, [5, 4, 3], '60', ['10.00', '8.00', '6.00'])), 0, '60', 20, 3));
});
test('C04 six no-fit orientations, null winner and occupied sizes', () => {
  assert.deepEqual(calculateBoxFit(requestOf(['2', '2', '2'], ['3', '1', '1'], '0', true)), success([
    row(0, [0, 2, 2], '0', null), row(1, [0, 2, 2], '0', null),
    row(2, [2, 0, 2], '0', null), row(3, [2, 2, 0], '0', null),
    row(4, [2, 0, 2], '0', null), row(5, [2, 2, 0], '0', null),
  ], null, '0', 0, 0));
});
test('C05 gap 0.5 only between adjacent items', () => {
  assert.deepEqual(calculateBoxFit(base({ gapRaw: '0.5' })), success([row(0, [3, 3, 2], '18', ['10.00', '7.00', '4.50'])], 0, '18', 9, 2));
});
test('C06 exact fill with nonzero gap', () => {
  assert.deepEqual(calculateBoxFit(requestOf(['6.5', '5.5', '4.5'], ['3', '2.5', '2'], '0.5')), success([row(0, [2, 2, 2], '8', ['6.50', '5.50', '4.50'])], 0, '8', 4, 2));
});
test('C07 smallest item and box', () => {
  assert.deepEqual(calculateBoxFit(requestOf(['0.01', '0.01', '0.01'], ['0.01', '0.01', '0.01'])), success([row(0, [1, 1, 1], '1', ['0.01', '0.01', '0.01'])], 0, '1', 1, 1));
});
test('C08 one zero axis suppresses occupied sizes and layer summary', () => {
  assert.deepEqual(calculateBoxFit(requestOf(['2.99', '5', '5'], ['3', '1', '1'])), success([row(0, [0, 5, 5], '0', null)], null, '0', 0, 0));
});
test('C09 six distinct totals; HWL wins', () => {
  assert.deepEqual(calculateBoxFit(base({ itemLengthRaw: '6', itemWidthRaw: '4', itemHeightRaw: '2', allowRotation: true })), success([
    row(0, [1, 2, 3], '6', ['6.00', '8.00', '6.00']),
    row(1, [1, 4, 1], '4', ['6.00', '8.00', '4.00']),
    row(2, [2, 1, 3], '6', ['8.00', '6.00', '6.00']),
    row(3, [2, 4, 1], '8', ['8.00', '8.00', '6.00']),
    row(4, [5, 1, 1], '5', ['10.00', '6.00', '4.00']),
    row(5, [5, 2, 1], '10', ['10.00', '8.00', '6.00']),
  ], 5, '10', 10, 1));
});
test('C10 equal dimensions fit one, without wall padding', () => {
  assert.deepEqual(calculateBoxFit(requestOf(['10', '8', '6'], ['10', '8', '6'])), success([row(0, [1, 1, 1], '1', ['10.00', '8.00', '6.00'])], 0, '1', 1, 1));
});
test('C11 maximum gap and minimum item', () => {
  assert.deepEqual(calculateBoxFit(requestOf(['100000', '100000', '100000'], ['0.01', '0.01', '0.01'], '10000')), success([row(0, [10, 10, 10], '1000', ['90000.10', '90000.10', '90000.10'])], 0, '1000', 100, 10));
});
test('C12 maximum 10^21 count is an exact decimal string', () => {
  assert.deepEqual(calculateBoxFit(requestOf(['100000', '100000', '100000'], ['0.01', '0.01', '0.01'])), success([row(0, [10000000, 10000000, 10000000], '1000000000000000000000', ['100000.00', '100000.00', '100000.00'])], 0, '1000000000000000000000', 100000000000000, 10000000));
});
test('C13 12-character leading-zero decimal', () => {
  assert.deepEqual(calculateBoxFit(requestOf(['000000000.01', '0.01', '0.01'], ['0.01', '0.01', '0.01'])), success([row(0, [1, 1, 1], '1', ['0.01', '0.01', '0.01'])], 0, '1', 1, 1));
});
test('C14 exactly one layer', () => {
  assert.deepEqual(calculateBoxFit(base({ itemHeightRaw: '6' })), success([row(0, [3, 4, 1], '12', ['9.00', '8.00', '6.00'])], 0, '12', 12, 1));
});
test('C15 exact hundredth-unit gap', () => {
  assert.deepEqual(calculateBoxFit(requestOf(['1.01', '1.01', '1.01'], ['0.5', '0.5', '0.5'], '0.01')), success([row(0, [2, 2, 2], '8', ['1.01', '1.01', '1.01'])], 0, '8', 4, 2));
});
test('C16 maximum dimension and gap; no duplicate-row removal', () => {
  assert.deepEqual(calculateBoxFit(requestOf(['100000', '100000', '100000'], ['100000', '100000', '100000'], '10000', true)), success(axes.map((_, index) => row(index, [1, 1, 1], '1', ['100000.00', '100000.00', '100000.00'])), 0, '1', 1, 1));
});
test('C17 length takes precedence over format and range', () => {
  assert.deepEqual(calculateBoxFit(base({ boxLengthRaw: '0000000000000' })), error('raw_too_long', 'boxLengthRaw'));
});
test('C18 zero item dimension', () => assert.deepEqual(calculateBoxFit(base({ itemHeightRaw: '0.00' })), error('out_of_range', 'itemHeightRaw')));
test('C19 gap upper bound', () => assert.deepEqual(calculateBoxFit(base({ gapRaw: '10000.01' })), error('out_of_range', 'gapRaw')));
test('C20 box upper bound', () => assert.deepEqual(calculateBoxFit(base({ boxWidthRaw: '100000.01' })), error('out_of_range', 'boxWidthRaw')));
test('C21 full-width zero', () => assert.deepEqual(calculateBoxFit(base({ gapRaw: '０' })), error('invalid_format', 'gapRaw')));
test('C22 exponent rejected', () => assert.deepEqual(calculateBoxFit(base({ itemLengthRaw: '3e0' })), error('invalid_format', 'itemLengthRaw')));
test('C23 rotation must be boolean', () => assert.deepEqual(calculateBoxFit(base({ allowRotation: 'true' })), error('invalid_type', 'allowRotation')));
test('C24 missing required field', () => {
  const input = base(); delete input.itemHeightRaw;
  assert.deepEqual(calculateBoxFit(input), error('invalid_schema', 'request'));
});
test('C25 unknown getter never executes', () => {
  let calls = 0; const input = base();
  Object.defineProperty(input, 'debug', { enumerable: true, get() { calls += 1; throw new Error('CANARY_SECRET'); } });
  assert.deepEqual(calculateBoxFit(input), error('invalid_schema', 'request'));
  assert.equal(calls, 0);
});
test('C26 known accessor never executes', () => {
  let calls = 0; const input = base();
  Object.defineProperty(input, 'itemWidthRaw', { enumerable: true, get() { calls += 1; return 'CANARY_SECRET'; } });
  assert.deepEqual(calculateBoxFit(input), error('invalid_schema', 'itemWidthRaw'));
  assert.equal(calls, 0);
});
test('C27 symbol and hidden unknown keys', () => {
  const symbol = base(); symbol[Symbol('extra')] = 0;
  const hidden = base(); Object.defineProperty(hidden, 'debug', { value: 'CANARY_SECRET' });
  assert.deepEqual(calculateBoxFit(symbol), error('invalid_schema', 'request'));
  assert.deepEqual(calculateBoxFit(hidden), error('invalid_schema', 'request'));
});
test('C28 root must have exactly Object.prototype', () => {
  for (const input of [null, undefined, 1, 1n, true, 'input', Symbol('x'), () => {}, [], new Date(0), Object.create({}), Object.create(null)]) {
    assert.deepEqual(calculateBoxFit(input), error('invalid_request', 'request'));
  }
});
test('C29 known nonenumerable data property', () => {
  const input = base(); Object.defineProperty(input, 'gapRaw', { value: '0', enumerable: false });
  assert.deepEqual(calculateBoxFit(input), error('invalid_schema', 'gapRaw'));
});
test('C30 no mutation, no raw echo, no partial output, JSON-safe result', () => {
  for (const input of [Object.freeze(base({ allowRotation: true })), Object.freeze(base({ itemLengthRaw: 'CANARY_SECRET' }))]) {
    const before = Object.getOwnPropertyDescriptors(input);
    const output = calculateBoxFit(input);
    assert.deepEqual(Object.getOwnPropertyDescriptors(input), before);
    assert.deepEqual(JSON.parse(JSON.stringify(output)), output);
    assert.doesNotMatch(JSON.stringify(output), /"(?:box|item|gap)[A-Za-z]*Raw"\s*:|CANARY_SECRET/);
    if (!output.ok) assert.deepEqual(Object.keys(output).sort(), ['error', 'ok']);
  }
});

test('Raw grammar: reject empty, whitespace, signs, Unicode, trailing dots and terminal newlines', () => {
  for (const raw of ['', ' ', ' 3', '3 ', '3\n', '3\r', '3\r\n', '\t3', '+3', '-3', '3,0', '３', '3．0', '3.', '.', '.3', '3.000', 'NaN', 'Infinity', '0x10']) {
    assert.deepEqual(calculateBoxFit(base({ itemLengthRaw: raw })), error('invalid_format', 'itemLengthRaw'));
  }
});
test('Raw type precedes length, grammar and range, for every field', () => {
  for (const field of ['boxLengthRaw', 'boxWidthRaw', 'boxHeightRaw', 'itemLengthRaw', 'itemWidthRaw', 'itemHeightRaw', 'gapRaw']) {
    for (const raw of [null, undefined, 3, 3n, {}, [], new String('3'), true]) {
      assert.deepEqual(calculateBoxFit(base({ [field]: raw })), error('invalid_type', field));
    }
  }
});
test('Stable field precedence and all descriptors checked before values', () => {
  assert.deepEqual(calculateBoxFit(base({ boxWidthRaw: 'invalid', boxHeightRaw: 0, allowRotation: 'false' })), error('invalid_format', 'boxWidthRaw'));
  const input = base({ boxLengthRaw: 'invalid' });
  Object.defineProperty(input, 'allowRotation', { get() { throw new Error('CANARY_SECRET'); } });
  assert.deepEqual(calculateBoxFit(input), error('invalid_schema', 'allowRotation'));
  const missingAndAccessor = base(); delete missingAndAccessor.gapRaw;
  Object.defineProperty(missingAndAccessor, 'boxLengthRaw', { get() { throw new Error('CANARY_SECRET'); } });
  assert.deepEqual(calculateBoxFit(missingAndAccessor), error('invalid_schema', 'request'));
});
test('Reflection traps return only fixed errors', () => {
  const trap = () => { throw new Error('CANARY_SECRET'); };
  assert.deepEqual(calculateBoxFit(new Proxy(base(), { getPrototypeOf: trap })), error('invalid_schema', 'request'));
  assert.deepEqual(calculateBoxFit(new Proxy(base(), { ownKeys: trap })), error('invalid_schema', 'request'));
  assert.deepEqual(calculateBoxFit(new Proxy(base(), { getOwnPropertyDescriptor: trap })), error('invalid_schema', 'boxLengthRaw'));
  const late = new Proxy(base(), { getOwnPropertyDescriptor(target, key) { if (key === 'gapRaw') return trap(); return Reflect.getOwnPropertyDescriptor(target, key); } });
  assert.deepEqual(calculateBoxFit(late), error('invalid_schema', 'gapRaw'));
  const revoked = Proxy.revocable(base(), {}); revoked.revoke();
  assert.deepEqual(calculateBoxFit(revoked.proxy), error('invalid_schema', 'request'));
});
test('Nonwritable/nonconfigurable data accepted; get trap never used', () => {
  const immutable = Object.freeze(base());
  let gets = 0;
  const proxy = new Proxy(immutable, { get() { gets += 1; throw new Error('CANARY_SECRET'); } });
  assert.deepEqual(calculateBoxFit(proxy), success([row(0, [3, 4, 3], '36', ['9.00', '8.00', '6.00'])], 0, '36', 12, 3));
  assert.equal(gets, 0);
});
test('Self-revocation during prototype reflection never escapes the API', () => {
  let revoke;
  const wrapped = Proxy.revocable(base(), { getPrototypeOf() { revoke(); return Object.prototype; } });
  revoke = wrapped.revoke;
  assert.deepEqual(calculateBoxFit(wrapped.proxy), error('invalid_schema', 'request'));
});
test('All zero-gap spellings and padded fractions are exact', () => {
  for (const gapRaw of ['0', '0.0', '0.00', '000000000000']) {
    assert.deepEqual(calculateBoxFit(base({ gapRaw })), success([row(0, [3, 4, 3], '36', ['9.00', '8.00', '6.00'])], 0, '36', 12, 3));
  }
  assert.deepEqual(calculateBoxFit(base({ itemLengthRaw: '003.00', gapRaw: '00.50' })), success([row(0, [3, 3, 2], '18', ['10.00', '7.00', '4.50'])], 0, '18', 9, 2));
});
test('Independent bound proof: axis <= 10^7, layer <= 10^14 < MAX_SAFE_INTEGER', () => {
  // If B < I, count=0. Otherwise (B+G)/(I+G) <= B/I for G>=0.
  // B <= 10^7 hundredth-mm units and I >= 1, so each count <= 10^7.
  assert.equal(10000000n / 1n, 10000000n);
  assert.equal(10000000n * 10000000n, 100000000000000n);
  assert.ok(100000000000000n < 9007199254740991n);
  assert.equal(10000000n ** 3n, 1000000000000000000000n);
});
test('Bounded independent invariants across fixed valid extrema', () => {
  for (const box of [['0.01', '0.01', '0.01'], ['10', '8', '6'], ['100000', '100000', '100000']]) {
    for (const item of [['0.01', '0.01', '0.01'], ['3', '2', '2'], ['100000', '100000', '100000']]) {
      for (const gap of ['0', '0.01', '10000']) {
        const output = calculateBoxFit(requestOf(box, item, gap, true));
        assert.equal(output.ok, true);
        assert.ok(Number.isSafeInteger(output.result.oneLayerCount) && output.result.oneLayerCount <= 100000000000000);
        assert.ok(Number.isSafeInteger(output.result.layerCount) && output.result.layerCount <= 10000000);
        for (const orientation of output.result.orientations) {
          assert.match(orientation.total, /^(?:0|[1-9][0-9]*)$/);
          for (const count of Object.values(orientation.axesCounts)) assert.ok(Number.isSafeInteger(count) && count >= 0 && count <= 10000000);
          assert.equal(orientation.occupiedMm === null, orientation.total === '0');
        }
      }
    }
  }
});
