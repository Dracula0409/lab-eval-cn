import { v4 as uuidv4 } from 'uuid';

export const PAYLOAD_TYPES = [
  ['string', 'String (ASCII)'],
  ['character', 'Character (ASCII)'],
  ['integer', 'Integer (32-bit)'],
  ['float', 'Float (32-bit IEEE 754)'],
  ['double', 'Double (64-bit IEEE 754)'],
  ['boolean', 'Boolean (32-bit 0 or 1)'],
  ['integerArray', 'Array of integers (JSON)'],
  ['typedArray', 'Array of another type (JSON)'],
  ['custom', 'Custom structure (field JSON)'],
  ['hex', 'Raw hexadecimal bytes'],
];

const toHex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

function asciiBytes(value) {
  const text = String(value);
  if ([...text].some((character) => character.charCodeAt(0) > 0x7f)) {
    throw new Error('String and character payloads must use ASCII characters only (code 0–127).');
  }
  return Uint8Array.from([...text], (character) => character.charCodeAt(0));
}

function numberBytes(value, byteLength, setter) {
  const view = new DataView(new ArrayBuffer(byteLength));
  setter(view, Number(value));
  return new Uint8Array(view.buffer);
}

function encodeOne(type, value) {
  switch (type) {
    case 'string': return asciiBytes(value);
    case 'character': {
      const chars = Array.from(String(value));
      if (chars.length !== 1) throw new Error('Character payloads must contain exactly one character.');
      return asciiBytes(chars[0]);
    }
    case 'integer': return numberBytes(value, 4, (view, n) => view.setInt32(0, n, false));
    case 'float': return numberBytes(value, 4, (view, n) => view.setFloat32(0, n, false));
    case 'double': return numberBytes(value, 8, (view, n) => view.setFloat64(0, n, false));
    case 'boolean': return numberBytes(value === true || String(value).toLowerCase() === 'true' ? 1 : 0, 4, (view, n) => view.setInt32(0, n, false));
    case 'hex': {
      const hex = String(value).replace(/^0x/i, '').replace(/\s/g, '');
      if (!hex || hex.length % 2 || /[^0-9a-f]/i.test(hex)) throw new Error('Raw hexadecimal must contain complete byte pairs only.');
      return Uint8Array.from(hex.match(/../g).map((pair) => parseInt(pair, 16)));
    }
    default: throw new Error(`Unsupported payload type: ${type}`);
  }
}

/** Convert a teacher payload to the raw bytes that tcpdump captures. */
export function encodePayload({ type, value, elementType = 'string' }) {
  if (type === 'integerArray') {
    const values = JSON.parse(value || '[]');
    if (!Array.isArray(values)) throw new Error('Integer array must be a JSON array.');
    return Uint8Array.from(values.flatMap((item) => Array.from(encodeOne('integer', item))));
  }
  if (type === 'typedArray') {
    const values = JSON.parse(value || '[]');
    if (!Array.isArray(values)) throw new Error('Array payload must be a JSON array.');
    return Uint8Array.from(values.flatMap((item) => Array.from(encodeOne(elementType, item))));
  }
  if (type === 'custom') {
    const fields = JSON.parse(value || '[]');
    if (!Array.isArray(fields)) throw new Error('Custom structure must be a JSON array of { type, value } fields.');
    return Uint8Array.from(fields.flatMap((field) => Array.from(encodeOne(field.type, field.value))));
  }
  return encodeOne(type, value);
}

export function buildReadSkipPattern(totalBytes, skipped = []) {
  const ordered = [...skipped]
    .map(({ start, end }) => ({ start: Math.max(0, start), end: Math.min(totalBytes, end) }))
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start);
  const merged = ordered.reduce((all, range) => {
    const previous = all[all.length - 1];
    if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
    else all.push({ ...range });
    return all;
  }, []);
  if (!merged.length) return [0];
  const pattern = [];
  let position = 0;
  merged.forEach(({ start, end }) => {
    if (start > position) pattern.push(start - position);
    pattern.push(-(end - start));
    position = end;
  });
  if (position < totalBytes) pattern.push(totalBytes - position);
  return pattern;
}

export function serializeBuilderCases(cases) {
  const output = {};
  cases.forEach((testcase, index) => {
    output[`testcase${index + 1}`] = testcase.communications.map((communication) => {
      const [source, destination] = String(communication.direction || '').split('_to_');
      if (!source || !destination) {
        throw new Error(`Test case ${index + 1} has a communication without a source and destination.`);
      }
      const bytes = encodePayload(communication);
      const pattern = buildReadSkipPattern(bytes.length, communication.skippedBytes);
      return [pattern, { [communication.direction]: `0x${toHex(bytes)}` }];
    });
  });
  return output;
}

export function byteOffsetAt(text, characterOffset) {
  // Text skip selection is ASCII-only, so character and byte offsets match.
  return String(text).slice(0, characterOffset).length;
}

const createBuilderId = () => globalThis.crypto?.randomUUID?.() ?? uuidv4();

const defaultCommunication = (direction = '') => ({
  id: createBuilderId(), direction, type: 'string', elementType: 'string', value: '', skippedBytes: [],
});

export function newBuilderCase(direction = '') {
  return { id: createBuilderId(), communications: [defaultCommunication(direction)] };
}

function decodeText(hex) {
  try {
    const bytes = Uint8Array.from(hex.match(/../g) || [], (pair) => parseInt(pair, 16));
    if (Array.from(bytes).some((byte) => byte > 0x7f)) throw new Error('Not ASCII');
    const text = String.fromCharCode(...bytes);
    return { type: 'string', value: text };
  } catch {
    return { type: 'hex', value: hex };
  }
}

/** Best-effort conversion keeps legacy JSON editable in the new builder. */
export function testcasesToBuilder(testcases, direction = '') {
  if (!testcases || typeof testcases !== 'object' || Array.isArray(testcases)) return [newBuilderCase(direction)];
  const cases = Object.keys(testcases).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map((key) => {
    const communications = (Array.isArray(testcases[key]) ? testcases[key] : []).flatMap((entry) => {
      let pattern = [0];
      let communication = entry;
      if (Array.isArray(entry) && Array.isArray(entry[0]) && entry[1] && typeof entry[1] === 'object') {
        [pattern, communication] = entry;
      }
      if (!communication || typeof communication !== 'object' || Array.isArray(communication)) return [];
      return Object.entries(communication).map(([directionKey, payload]) => {
        const hex = typeof payload === 'string' && /^0x/i.test(payload) ? payload.slice(2).replace(/\s/g, '') : null;
        const decoded = hex ? decodeText(hex) : { type: 'string', value: String(payload ?? '') };
        const skippedBytes = [];
        let position = 0;
        if (Array.isArray(pattern)) pattern.forEach((part) => {
          if (part < 0) skippedBytes.push({ start: position, end: position + Math.abs(part) });
          position += Math.abs(part);
        });
        return { ...defaultCommunication(directionKey), direction: directionKey, ...decoded, skippedBytes };
      });
    });
    return { id: createBuilderId(), communications: communications.length ? communications : [defaultCommunication(direction)] };
  });
  return cases.length ? cases : [newBuilderCase(direction)];
}
