const KEYS = Object.freeze([
  'boxLengthRaw', 'boxWidthRaw', 'boxHeightRaw',
  'itemLengthRaw', 'itemWidthRaw', 'itemHeightRaw', 'gapRaw', 'allowRotation',
]);
const AXES = Object.freeze([
  ['L', 'W', 'H'], ['L', 'H', 'W'], ['W', 'L', 'H'],
  ['W', 'H', 'L'], ['H', 'L', 'W'], ['H', 'W', 'L'],
].map(Object.freeze));
const BOX_AXES = Object.freeze(['boxLength', 'boxWidth', 'boxHeight']);
const fail = (code, field) => ({ ok: false, error: { code, field } });

function fixedMm(units) {
  return `${units / 100n}.${(units % 100n).toString().padStart(2, '0')}`;
}

export function calculateBoxFit(request) {
  if (request === null || typeof request !== 'object') return fail('invalid_request', 'request');
  let prototype;
  let isArray;
  try {
    prototype = Object.getPrototypeOf(request);
    isArray = Array.isArray(request);
  }
  catch { return fail('invalid_schema', 'request'); }
  if (prototype !== Object.prototype || isArray) return fail('invalid_request', 'request');

  let ownKeys;
  try { ownKeys = Reflect.ownKeys(request); }
  catch { return fail('invalid_schema', 'request'); }
  if (ownKeys.some(key => typeof key !== 'string' || !KEYS.includes(key))) {
    return fail('invalid_schema', 'request');
  }
  if (KEYS.some(key => !ownKeys.includes(key))) return fail('invalid_schema', 'request');

  // Validate every descriptor before reading even the first data value.
  const descriptors = [];
  for (const key of KEYS) {
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(request, key); }
    catch { return fail('invalid_schema', key); }
    if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.enumerable) {
      return fail('invalid_schema', key);
    }
    descriptors.push(descriptor);
  }

  const units = [];
  for (let index = 0; index < 7; index += 1) {
    const raw = descriptors[index].value;
    const field = KEYS[index];
    if (typeof raw !== 'string') return fail('invalid_type', field);
    if (raw.length > 12) return fail('raw_too_long', field);
    // Comparing the full match also rejects a final newline (JS $ can match before it).
    if (/^[0-9]+(?:\.[0-9]{1,2})?$/.exec(raw)?.[0] !== raw) return fail('invalid_format', field);
    const [whole, fraction = ''] = raw.split('.');
    const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
    const minimum = index === 6 ? 0n : 1n;
    const maximum = index === 6 ? 1000000n : 10000000n;
    if (value < minimum || value > maximum) return fail('out_of_range', field);
    units.push(value);
  }
  const allowRotation = descriptors[7].value;
  if (typeof allowRotation !== 'boolean') return fail('invalid_type', 'allowRotation');

  const item = { L: units[3], W: units[4], H: units[5] };
  const gap = units[6];
  const orientations = [];
  let winnerIndex = null;
  let maximum = 0n;
  let oneLayerCount = 0;
  let layerCount = 0;
  for (let index = 0; index < (allowRotation ? 6 : 1); index += 1) {
    const itemAxes = [...AXES[index]];
    const counts = itemAxes.map((axis, boxIndex) => (units[boxIndex] + gap) / (item[axis] + gap));
    const total = counts[0] * counts[1] * counts[2];
    const axesCounts = Object.fromEntries(BOX_AXES.map((axis, boxIndex) => [axis, Number(counts[boxIndex])]));
    const occupiedMm = total === 0n ? null : Object.fromEntries(BOX_AXES.map((axis, boxIndex) => [
      axis, fixedMm(counts[boxIndex] * item[itemAxes[boxIndex]] + (counts[boxIndex] - 1n) * gap),
    ]));
    orientations.push({ index, itemAxes, axesCounts, total: total.toString(), occupiedMm });
    if (total > maximum) {
      maximum = total;
      winnerIndex = index;
      oneLayerCount = Number(counts[0] * counts[1]);
      layerCount = Number(counts[2]);
    }
  }
  return { ok: true, result: { schemaVersion: 1, orientations, winnerIndex, total: maximum.toString(), oneLayerCount, layerCount } };
}
