import assert from 'node:assert/strict';
import {
  blocksToEvalBody,
  buildFullNiceSh,
  evalBodyToBlocks,
  extractEvalBodyFromNiceSh,
  newBlock,
  newEvalScriptState,
  sanitizeEvalScriptState,
  syncTestcaseSectionCount,
} from './evalScriptBuilderUtils.js';

const files = [
  { name: 'server', tag: 's1' },
  { name: 'client', tag: 'c1' },
];

const state = newEvalScriptState(1);
const body = blocksToEvalBody(state, files);

assert.match(body, /^PROTO="tcp"/);
assert.match(body, /COMPILE_RUN "\$\{SERVER\[0\]\}" "server0"/);
assert.match(body, /COMPILE_RUN "\$\{CLIENT\[0\]\}" "client0" \$\{CLIENT_PORT\[0\]\}/);
assert.match(body, /TEST CASE 1/);
assert.match(body, /EVALUATE "\$PROTO" 1/);

const full = buildFullNiceSh({ questionKey: 'q7', evalBody: body });
assert.match(full, /^#!\/bin\/bash/);
assert.match(full, /Qi="q7"/);
assert.match(full, /EVAL_FLOW_START/);
assert.match(full, /EVAL_FLOW_END/);

const roundTrip = extractEvalBodyFromNiceSh(full);
assert.equal(roundTrip.trim(), body.trim());

const parsed = evalBodyToBlocks(body, 1);
assert.ok(parsed.testCases.length >= 1);
assert.ok(parsed.preamble.some((b) => b.type === 'set_protocol'));

const shellOnly = evalBodyToBlocks('sleep 2\nFLUSH_ALL\n', 1);
assert.ok(shellOnly.testCases[0].blocks.some((b) => b.type === 'sleep'));

const boilerplateBody = `echo "server files $1"
declare -a SERVER
source ./fun.sh
PROTO="tcp"
bash reduce_port_timeout.sh
START_TCPDUMP "$PROTO" "\${SERVER_PORT[0]}" "transfer.pcap"
EVALUATE tcp 1
bash reset_port_timeout.sh`;
const cleaned = evalBodyToBlocks(boilerplateBody, 1);
assert.ok(!cleaned.preamble.some((b) => b.type === 'custom_bash'));
assert.ok(cleaned.preamble.some((b) => b.type === 'set_protocol'));
assert.equal(cleaned.epilogue.length, 0);

const withAuto = blocksToEvalBody(newEvalScriptState(1), files);
assert.match(withAuto, /bash reduce_port_timeout\.sh/);
assert.match(withAuto, /bash reset_port_timeout\.sh/);

const legacy = evalBodyToBlocks(`PROTO="tcp"
bash reduce_port_timeout.sh
START_TCPDUMP "$PROTO" "\${SERVER_PORT[0]}" "transfer.pcap"
COMPILE_RUN "\$TAG_s1" myserver
EVALUATE tcp 1
bash reset_port_timeout.sh`, 1);
assert.ok(legacy.preamble.some((b) => b.type === 'set_protocol'));
assert.ok(legacy.testCases[0].blocks.some((b) => b.type === 'compile_run' && b.alias === 'myserver'));

const synced = syncTestcaseSectionCount(newEvalScriptState(1), 3);
assert.equal(synced.testCases.length, 3);
assert.equal(synced.testCases[2].blocks.find((b) => b.type === 'evaluate')?.testcaseStart, '3');

const custom = newEvalScriptState(1);
custom.testCases[0].blocks.push({ ...newBlock('custom_bash'), line: 'echo "starting"\nexport FLAG=1' });
assert.ok(sanitizeEvalScriptState(custom, 1).testCases[0].blocks.some((b) => b.type === 'custom_bash'));
assert.match(blocksToEvalBody(custom, files), /echo "starting"\nexport FLAG=1/);

console.log('evalScriptBuilderUtils.test.mjs: ok');
