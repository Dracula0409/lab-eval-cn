import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReadSkipPattern, byteOffsetAt, parseEscapedPayloadText } from './testcaseBuilderUtils.js';

test('parses carriage return and newline escapes', () => {
  assert.equal(parseEscapedPayloadText('Hello\\rWorld'), 'Hello\rWorld');
  assert.equal(parseEscapedPayloadText('Hello\\nWorld'), 'Hello\nWorld');
  assert.equal(parseEscapedPayloadText('Hello\\\\rWorld'), 'Hello\\rWorld');
  assert.equal(parseEscapedPayloadText('Hello\\\\\\rWorld'), 'Hello\\\rWorld');
});

test('handles literal backslash before escape correctly', () => {
  assert.equal(parseEscapedPayloadText('hello\\r\\\\r'), 'hello\r\\r');
});

test('parses full C-style escape sequences', () => {
  const actual = parseEscapedPayloadText('a\\nb\\tc\\rd\\fe\\vf\\a');
  const expected = String.fromCharCode(97, 10, 98, 9, 99, 13, 100, 12, 101, 11, 102, 7);
  assert.equal(actual, expected);
  assert.equal(parseEscapedPayloadText("quote\\'\""), "quote'\"");
  assert.equal(parseEscapedPayloadText('question\\?'), 'question?');
  assert.equal(parseEscapedPayloadText('hex\\x41'), 'hexA');
  assert.equal(parseEscapedPayloadText('octal\\012'), 'octal\n');
});

test('calculates skip ranges in decoded bytes, not escape-source characters', () => {
  const value = 'A\\nBC';
  assert.equal(byteOffsetAt(value, 1), 1);
  assert.equal(byteOffsetAt(value, 3), 2); // A + decoded newline
  assert.deepEqual(buildReadSkipPattern(4, [{ start: byteOffsetAt(value, 1), end: byteOffsetAt(value, 3) }]), [1, -1, 2]);
});
