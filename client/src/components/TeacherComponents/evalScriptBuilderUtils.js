import { v4 as uuidv4 } from 'uuid';

export const EVAL_FLOW_START = '# --- EVAL_FLOW_START ---';
export const EVAL_FLOW_END = '# --- EVAL_FLOW_END ---';

export const CONNECTION_STATES = [
  'LISTEN',
  'ESTABLISHED',
  'CLOSE_WAIT',
  'TIME_WAIT',
  'FIN_WAIT2',
  'SYN_SENT',
];

const createId = () => globalThis.crypto?.randomUUID?.() ?? uuidv4();

/** Simplified block types shown in the palette (maps to fun.sh). */
export const BLOCK_CATALOG = [
  { type: 'set_protocol', category: 'Setup', label: 'Protocol', description: 'Set PROTO (tcp/udp)' },
  { type: 'compile', category: 'Program', label: 'Compile', description: 'COMPILE source → binary name' },
  { type: 'run', category: 'Program', label: 'Run', description: 'RUN compiled binary' },
  { type: 'compile_run', category: 'Program', label: 'Compile & run', description: 'Build and start a program' },
  { type: 'input', category: 'Input', label: 'Feed stdin', description: 'INPUT lines from input file' },
  { type: 'sleep', category: 'Input', label: 'Wait', description: 'Pause (seconds)' },
  { type: 'start_capture', category: 'Capture', label: 'Start capture', description: 'START_TCPDUMP' },
  { type: 'flush_capture', category: 'Capture', label: 'Parse capture', description: 'FLUSH_TCPDUMP' },
  { type: 'stop_capture', category: 'Capture', label: 'Stop capture', description: 'END_TCPDUMP' },
  { type: 'wait_port', category: 'Network', label: 'Wait for free port', description: 'WAIT_PORT before bind' },
  { type: 'check_port', category: 'Network', label: 'Check connection', description: 'CHECK_PORT socket state' },
  { type: 'assign_port', category: 'Network', label: 'Mark port', description: 'ASSIGN_PORT bookkeeping' },
  { type: 'get_ports', category: 'Network', label: 'List assigned ports', description: 'get_ports' },
  { type: 'port_range_set', category: 'Network', label: 'Set ephemeral range', description: 'PORT_RANGE_SET' },
  { type: 'port_range_reset', category: 'Network', label: 'Reset ephemeral range', description: 'PORT_RANGE_RESET' },
  { type: 'is_alive', category: 'Process', label: 'Program running?', description: 'ISALIVE' },
  { type: 'stop_program', category: 'Process', label: 'Stop program', description: 'SAFE_KILL' },
  { type: 'force_kill_port', category: 'Process', label: 'Force kill port', description: 'FORCE_KILL_PORT' },
  { type: 'flush_logs', category: 'Cleanup', label: 'Flush logs', description: 'FLUSH_ALL' },
  { type: 'reset_programs', category: 'Cleanup', label: 'Reset programs', description: 'CLEAR_ALL' },
  { type: 'start_persistent', category: 'HTTP', label: 'Start persistence check', description: 'START_CHECK_PERSISTENT' },
  { type: 'end_persistent', category: 'HTTP', label: 'Grade persistence', description: 'END_CHECK_PERSISTENT' },
  { type: 'evaluate', category: 'Grade', label: 'Grade testcase', description: 'EVALUATE testcase(s)' },
  { type: 'custom_bash', category: 'Advanced', label: 'Custom bash', description: 'One custom shell line (e.g. setup file)' },
];

const CATEGORY_COLORS = {
  Setup: 'border-slate-300 bg-slate-50',
  Program: 'border-blue-300 bg-blue-50',
  Input: 'border-violet-300 bg-violet-50',
  Capture: 'border-cyan-300 bg-cyan-50',
  Network: 'border-amber-300 bg-amber-50',
  Process: 'border-orange-300 bg-orange-50',
  Cleanup: 'border-rose-300 bg-rose-50',
  HTTP: 'border-emerald-300 bg-emerald-50',
  Grade: 'border-indigo-300 bg-indigo-50',
  Advanced: 'border-slate-400 bg-slate-100',
  Teardown: 'border-slate-300 bg-slate-50',
};

export function blockCategoryColor(type) {
  const entry = BLOCK_CATALOG.find((item) => item.type === type);
  const map = {
    Setup: '#64748b',
    Program: '#3b82f6',
    Input: '#8b5cf6',
    Capture: '#06b6d4',
    Network: '#f59e0b',
    Process: '#f97316',
    Cleanup: '#f43f5e',
    HTTP: '#10b981',
  Grade: '#6366f1',
    Advanced: '#94a3b8',
    Teardown: '#64748b',
  };
  return map[entry?.category] || '#94a3b8';
}

const BOILERPLATE_LINE_RES = [
  /^#!\/bin\/bash/,
  /^echo\s/,
  /^declare\s/,
  /^FILE_PATH=/,
  /^Qi=/,
  /^source\s+\.\//,
  /^>\s/,
  /^for\s+setOfFiles/,
  /^do$/,
  /^done$/,
  /^if\s+\[\[/,
  /^fi$/,
  /^IFS=/,
  /^# THE STAFF/,
  /^# Do not forget/,
  /^echo "end of work"/,
  /EVAL_FLOW_(START|END)/,
  /^#-+ TEST CASE/,
  /^#=+ END TEST_CASE/,
];

export function isBoilerplateLine(line = '') {
  const trimmed = String(line || '').trim();
  if (!trimmed) return true;
  return BOILERPLATE_LINE_RES.some((pattern) => pattern.test(trimmed));
}

function convertLegacyShellBlock(block) {
  const line = String(block.line || '').trim();
  if (/reduce_port_timeout/.test(line)) return null;
  if (/reset_port_timeout/.test(line)) return null;
  if (isBoilerplateLine(line)) return null;
  if (line.startsWith('#')) return null;
  return { ...newBlock('custom_bash'), id: block.id, line };
}

function sanitizeBlock(block) {
  if (!block?.type) return null;
  if (block.type === 'reduce_port_timeout' || block.type === 'reset_port_timeout') return null;
  if (block.type === 'custom_bash') {
    // A newly inserted block is intentionally blank until the teacher types
    // into it.  Do not treat normal shell commands (or comments) as
    // boilerplate here: custom_bash is an explicit request to preserve them.
    return { ...block, line: String(block.line || '') };
  }
  if (block.type === 'shell') return convertLegacyShellBlock(block);
  if (block.type === 'comment') return null;
  return block;
}

export function sanitizeBlocks(blocks = []) {
  return (blocks || [])
    .map((block) => sanitizeBlock({ ...newBlock(block.type), ...block }))
    .filter(Boolean);
}

export function sanitizeEvalScriptState(state, testcaseCount = 1) {
  if (!state || typeof state !== 'object') return newEvalScriptState(testcaseCount);
  const preamble = sanitizeBlocks(state.preamble).filter((b) => b.type === 'set_protocol').slice(0, 1);
  return {
    preamble: preamble.length ? preamble : [newBlock('set_protocol')],
    testCases: (state.testCases || []).map((testCase, index) => ({
      ...testCase,
      id: testCase.id || createId(),
      label: testCase.label || `Test case ${index + 1}`,
      blocks: sanitizeBlocks(testCase.blocks),
    })),
    epilogue: [],
  };
}

export function blockNeedsExpand(type) {
  return ['check_port', 'start_capture', 'input', 'compile_run', 'custom_bash', 'assign_port', 'port_range_set', 'end_persistent', 'evaluate', 'compile'].includes(type);
}

export function blockInlineLabel(type) {
  return BLOCK_CATALOG.find((item) => item.type === type)?.label || type;
}

export function defaultBlockFields(type) {
  switch (type) {
    case 'set_protocol':
      return { protocol: 'tcp' };
    case 'reduce_port_timeout':
    case 'reset_port_timeout':
      return {};
    case 'compile':
      return { fileRef: 'server:0', outName: 'server0' };
    case 'run':
      return { outName: 'server0' };
    case 'compile_run':
      return { fileRef: 'server:0', alias: 'server0', portExpr: '' };
    case 'input':
      return { alias: 'client0', inputFile: 'input', startLine: '1', lineCount: '1' };
    case 'sleep':
      return { seconds: '1' };
    case 'start_capture':
      return { protocolExpr: '$PROTO', portExpr: '${SERVER_PORT[0]}', fileName: 'transfer.pcap' };
    case 'flush_capture':
    case 'get_ports':
    case 'start_persistent':
      return {};
    case 'stop_capture':
      return {};
    case 'wait_port':
      return { protocolExpr: '$PROTO', portExpr: '${SERVER_PORT[0]}' };
    case 'check_port':
      return {
        fromExpr: '127.0.0.1:${SERVER_PORT[0]}',
        toExpr: '0.0.0.0:0000',
        alias: 'server0',
        protocolExpr: '$PROTO',
        state: 'LISTEN',
        expectAbsent: '',
      };
    case 'assign_port':
      return { appName: 'myserver', appType: 'server', portExpr: '${SERVER_PORT[0]}' };
    case 'port_range_set':
      return { start: '10000', end: '20000' };
    case 'port_range_reset':
      return {};
    case 'is_alive':
    case 'stop_program':
      return { alias: 'server0' };
    case 'force_kill_port':
      return { portExpr: '${SERVER_PORT[0]}' };
    case 'flush_logs':
    case 'reset_programs':
      return {};
    case 'end_persistent':
      return { maxReconnect: '3', mode: 'persistent' };
    case 'evaluate':
      return { protocolExpr: '$PROTO', testcaseStart: '1', testcaseEnd: '' };
    case 'custom_bash':
      return { line: '' };
    default:
      return {};
  }
}

export function newBlock(type) {
  return { id: createId(), type, ...defaultBlockFields(type) };
}

function parseFileRefFromSource(source = '') {
  const text = String(source);
  const clientMatch = text.match(/CLIENT\[(\d+)\]/i);
  if (clientMatch) return `client:${clientMatch[1]}`;
  const serverMatch = text.match(/SERVER\[(\d+)\]/i);
  if (serverMatch) return `server:${serverMatch[1]}`;
  const tagMatch = text.match(/\$TAG_(s|c)(\d+)/i);
  if (tagMatch) {
    const role = tagMatch[1].toLowerCase() === 'c' ? 'client' : 'server';
    return `${role}:${Math.max(0, Number.parseInt(tagMatch[2], 10) - 1)}`;
  }
  return 'server:0';
}

/** Standard per-testcase flow matching the TCP echo server pattern. */
export function defaultTestcaseFlowBlocks(index = 0) {
  const testcaseNo = String(index + 1);
  return [
    newBlock('start_capture'),
    newBlock('sleep'),
    newBlock('wait_port'),
    newBlock('compile_run'),
    newBlock('sleep'),
    newBlock('check_port'),
    { ...newBlock('compile_run'), fileRef: 'client:0', alias: 'client0', portExpr: '${CLIENT_PORT[0]}' },
    newBlock('sleep'),
    { ...newBlock('check_port'), fromExpr: '127.0.0.1:${SERVER_PORT[0]}', toExpr: '127.0.0.1:${CLIENT_PORT[0]}', alias: 'server0', state: 'ESTABLISHED' },
    { ...newBlock('input'), alias: 'client0', startLine: testcaseNo },
    newBlock('sleep'),
    newBlock('stop_capture'),
    newBlock('reset_programs'),
    { ...newBlock('evaluate'), testcaseStart: testcaseNo },
  ];
}

export function syncTestcaseSectionCount(state, count) {
  const target = Math.max(1, count);
  const cases = state.testCases || [];
  if (cases.length === target) return state;
  if (cases.length > target) {
    return { ...state, testCases: cases.slice(0, target) };
  }
  const nextCases = [...cases];
  for (let index = cases.length; index < target; index += 1) {
    nextCases.push({
      id: createId(),
      label: `Test case ${index + 1}`,
      blocks: defaultTestcaseFlowBlocks(index),
    });
  }
  return { ...state, testCases: nextCases };
}

export function newEvalScriptState(testcaseCount = 1) {
  const count = Math.max(1, testcaseCount);
  return {
    preamble: [newBlock('set_protocol')],
    testCases: Array.from({ length: count }, (_, index) => ({
      id: createId(),
      label: `Test case ${index + 1}`,
      blocks: defaultTestcaseFlowBlocks(index),
    })),
    epilogue: [],
  };
}

function fileRefToSource(fileRef, files) {
  const [role, indexStr] = String(fileRef || '').split(':');
  const index = Number.parseInt(indexStr, 10) || 0;
  const roleKey = role === 'client' ? 'CLIENT' : 'SERVER';
  const tagFiles = files.filter((file) => {
    const tag = String(file.tag || '').toLowerCase();
    if (role === 'client') return tag.startsWith('c');
    return tag.startsWith('s');
  });
  const file = tagFiles[index];
  const bashArrayRef = '${' + `${roleKey}[${index}]` + '}';
  return { bashArrayRef, label: file ? `${file.name} (${file.tag})` : `${roleKey}[${index}]` };
}

export function buildFileRefOptions(files = []) {
  const servers = files.filter((f) => String(f.tag || '').toLowerCase().startsWith('s'));
  const clients = files.filter((f) => String(f.tag || '').toLowerCase().startsWith('c'));
  return [
    ...servers.map((file, index) => ({
      value: `server:${index}`,
      label: `Server: ${file.name} (${file.tag}) → \${SERVER[${index}]}`,
    })),
    ...clients.map((file, index) => ({
      value: `client:${index}`,
      label: `Client: ${file.name} (${file.tag}) → \${CLIENT[${index}]}`,
    })),
  ];
}

export function buildPortExprOptions(socketConfig = {}) {
  const servers = Math.max(0, Number.parseInt(socketConfig.servers, 10) || 0);
  const clients = Math.max(0, Number.parseInt(socketConfig.clients, 10) || 0);
  const options = [{ value: '', label: '(none)' }];
  for (let index = 0; index < servers; index += 1) {
    options.push({ value: `\${SERVER_PORT[${index}]}`, label: `SERVER_PORT[${index}]` });
  }
  for (let index = 0; index < clients; index += 1) {
    options.push({ value: `\${CLIENT_PORT[${index}]}`, label: `CLIENT_PORT[${index}]` });
  }
  return options;
}

export function blockLabel(type) {
  return BLOCK_CATALOG.find((item) => item.type === type)?.label || type;
}

export function blockSummary(block, files = [], fileRefOptions = [], portOptions = []) {
  const fileLabel = (ref) => fileRefOptions.find((o) => o.value === ref)?.label?.split(' → ')[0]?.replace(/^(Server|Client):\s*/, '') || ref;
  const portLabel = (expr) => portOptions.find((o) => o.value === expr)?.label || expr;
  switch (block.type) {
    case 'set_protocol': return block.protocol || 'tcp';
    case 'reduce_port_timeout': return 'before tests';
    case 'reset_port_timeout': return 'after tests';
    case 'compile_run': return `${fileLabel(block.fileRef)} → ${block.alias || 'prog'}`;
    case 'compile': return `${fileLabel(block.fileRef)} → ${block.outName}`;
    case 'run': return block.outName;
    case 'input': return `${block.alias} line ${block.startLine} × ${block.lineCount}`;
    case 'sleep': return `${block.seconds}s`;
    case 'start_capture': return portLabel(block.portExpr) || block.portExpr;
    case 'wait_port': return portLabel(block.portExpr) || block.portExpr;
    case 'check_port': return `${block.alias} ${block.state}${block.expectAbsent === 'NO' ? ' (absent OK)' : ''}`;
    case 'evaluate': return `#${block.testcaseStart}${block.testcaseEnd ? `–${block.testcaseEnd}` : ''}`;
    case 'stop_program': return block.alias;
    case 'is_alive': return block.alias;
    case 'force_kill_port': return portLabel(block.portExpr);
    case 'end_persistent': return `${block.mode}, max ${block.maxReconnect}`;
    case 'custom_bash': return block.line || '…';
    default: return '';
  }
}

export function buildAliasOptions(state) {
  const aliases = new Set();
  const collect = (blocks) => blocks.forEach((block) => {
    if (block.alias) aliases.add(block.alias);
    if (block.outName) aliases.add(block.outName);
  });
  collect(state.preamble || []);
  (state.testCases || []).forEach((testCase) => collect(testCase.blocks || []));
  collect(state.epilogue || []);
  ['server0', 'client0', 'proxy0'].forEach((name) => aliases.add(name));
  return [...aliases].map((value) => ({ value, label: value }));
}

export function previewBlockLine(block, files = []) {
  return emitBlock(block, files);
}

function emitBlock(block, files) {
  switch (block.type) {
    case 'set_protocol':
      return `PROTO="${block.protocol || 'tcp'}"`;
    case 'reduce_port_timeout':
      return 'bash reduce_port_timeout.sh';
    case 'reset_port_timeout':
      return 'bash reset_port_timeout.sh';
    case 'compile': {
      const { bashArrayRef } = fileRefToSource(block.fileRef, files);
      return `COMPILE "${bashArrayRef}" "${block.outName || 'out'}"`;
    }
    case 'run':
      return `RUN "${block.outName || 'out'}"`;
    case 'compile_run': {
      const { bashArrayRef } = fileRefToSource(block.fileRef, files);
      const port = String(block.portExpr || '').trim();
      return port
        ? `COMPILE_RUN "${bashArrayRef}" "${block.alias || 'prog'}" ${port}`
        : `COMPILE_RUN "${bashArrayRef}" "${block.alias || 'prog'}"`;
    }
    case 'input':
      return `INPUT "${block.alias || 'client0'}" ${block.inputFile || 'input'} ${block.startLine || '1'} ${block.lineCount || '1'}`;
    case 'sleep':
      return `sleep ${block.seconds ?? 1}`;
    case 'start_capture':
      return `START_TCPDUMP "${block.protocolExpr || '$PROTO'}" "${block.portExpr || '${SERVER_PORT[0]}'}" "${block.fileName || 'transfer.pcap'}"`;
    case 'flush_capture':
      return 'FLUSH_TCPDUMP';
    case 'stop_capture':
      return 'END_TCPDUMP';
    case 'wait_port':
      return `WAIT_PORT "${block.protocolExpr || '$PROTO'}" ${block.portExpr || '${SERVER_PORT[0]}'}`;
    case 'check_port': {
      const base = `CHECK_PORT "${block.fromExpr}" "${block.toExpr}" "${block.alias}" "${block.protocolExpr || '$PROTO'}" "${block.state || 'LISTEN'}"`;
      return block.expectAbsent === 'NO' ? `${base} "NO"` : base;
    }
    case 'assign_port':
      return `ASSIGN_PORT "${block.appName}" "${block.appType}" ${block.portExpr}`;
    case 'get_ports':
      return 'get_ports';
    case 'port_range_set':
      return `PORT_RANGE_SET "${block.start}" "${block.end}"`;
    case 'port_range_reset':
      return 'PORT_RANGE_RESET';
    case 'is_alive':
      return `ISALIVE "${block.alias}"`;
    case 'stop_program':
      return `SAFE_KILL "${block.alias}"`;
    case 'force_kill_port':
      return `FORCE_KILL_PORT ${block.portExpr || '${SERVER_PORT[0]}'}`;
    case 'flush_logs':
      return 'FLUSH_ALL';
    case 'reset_programs':
      return 'CLEAR_ALL';
    case 'start_persistent':
      return 'START_CHECK_PERSISTENT';
    case 'end_persistent':
      return `END_CHECK_PERSISTENT ${block.maxReconnect || '3'} ${block.mode || 'persistent'}`;
    case 'evaluate': {
      const start = block.testcaseStart || '1';
      const end = String(block.testcaseEnd || '').trim();
      return end
        ? `EVALUATE "${block.protocolExpr || '$PROTO'}" ${start} ${end}`
        : `EVALUATE "${block.protocolExpr || '$PROTO'}" ${start}`;
    }
    case 'custom_bash':
      return String(block.line || '').trim();
    default:
      return `# unknown block ${block.type}`;
  }
}

function emitBlockList(blocks, files) {
  return (blocks || [])
    .map((block) => emitBlock(block, files))
    .filter((line) => line !== '')
    .join('\n');
}

/** Teacher flow only (stored in evalScript). Port timeout scripts are injected automatically. */
export function blocksToEvalBody(state, files = []) {
  const parts = [];
  const preamble = emitBlockList(state.preamble, files);
  if (preamble) parts.push(preamble);

  (state.testCases || []).forEach((testCase, index) => {
    const body = emitBlockList(testCase.blocks, files);
    const label = testCase.label || `Test case ${index + 1}`;
    parts.push(
      `#----------------- TEST CASE ${index + 1}  (${label}) -----------------\n${body}\n#================= END TEST_CASE ${index + 1}  (${label}) =============`,
    );
  });

  const epilogue = emitBlockList(state.epilogue, files);
  if (epilogue) parts.push(epilogue);

  let body = parts.join('\n\n').trim();
  if (!body.includes('reduce_port_timeout')) {
    if (/^PROTO="/m.test(body)) {
      body = body.replace(/^(PROTO="[^"]+"\n?)/m, '$1bash reduce_port_timeout.sh\n');
    } else {
      body = `bash reduce_port_timeout.sh\n${body}`;
    }
  }
  if (!body.includes('reset_port_timeout.sh')) {
    body = `${body}\n\nbash reset_port_timeout.sh`;
  }
  return body.trim();
}

export function buildNiceShBoilerplate(questionKey = 'q1') {
  return `#!/bin/bash
#       ^
#       |
#     Do not forget to check the shebang for your host machine

echo "The script       : $0"

echo "server files $1"
echo "client files $2"

declare -a CLIENT
declare -a SERVER

if [[ $# == 3 ]];then
	declare -a PROXY
	IFS=' ' read -a PROXY  <<< "$3"
fi

IFS=' ' read -a SERVER <<< "$1"
IFS=' ' read -a CLIENT <<< "$2"

for setOfFiles in "$@";
do
	echo ">>>>$setOfFiles"
done

> connectionstatus.log
> unitsep.log

FILE_PATH=$2

declare -i PROGRAMS_RAN_COUNT=0

declare -A coprocPids
declare -A coprocFDs
declare -A coprocReadFDs
declare -A programPids
declare -A Assigned_Ports

Qi="${questionKey}"

source ./fun.sh
source ./clientPorts.sh
source ./serverPorts.sh
source ./student.sh

> \${student_id}_conn.csv
> \${student_id}_status.csv
> \${student_id}_evaluated.csv

# THE STAFF SHOULD WRITE THE CODE HERE TO
# DO THE EVALUATION IN RESPECT TO THIER NEED.
# THIS SYSTEM IS COMPLETELY RELIABLE AND
# FLEXIBLE.

${EVAL_FLOW_START}
`;
}

export function buildFullNiceSh({ questionKey = 'q1', evalBody = '' }) {
  const body = String(evalBody || '').trim();
  const footer = `
${EVAL_FLOW_END}

echo "end of work"
`;
  return `${buildNiceShBoilerplate(questionKey)}${body ? `${body}\n` : ''}${footer}`;
}

export function extractEvalBodyFromNiceSh(script) {
  const text = String(script || '');
  const start = text.indexOf(EVAL_FLOW_START);
  const end = text.indexOf(EVAL_FLOW_END);
  if (start >= 0 && end > start) {
    return text.slice(start + EVAL_FLOW_START.length, end).trim();
  }
  if (text.trim().startsWith('#!/bin/bash')) {
    return '';
  }
  return text.trim();
}

function parseLineToBlock(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('# ---') || isBoilerplateLine(trimmed)) return null;
  if (trimmed.startsWith('#')) return null;

  const sleepMatch = trimmed.match(/^sleep\s+(\S+)/i);
  if (sleepMatch) return { ...newBlock('sleep'), seconds: sleepMatch[1] };

  const protoMatch = trimmed.match(/^PROTO="(\w+)"/);
  if (protoMatch) return { ...newBlock('set_protocol'), protocol: protoMatch[1] };

  if (/^bash reduce_port_timeout\.sh/.test(trimmed)) return null;
  if (/^bash reset_port_timeout\.sh/.test(trimmed)) return null;

  const patterns = [
    { re: /^START_TCPDUMP\s+"([^"]*)"\s+"([^"]*)"\s+"([^"]*)"/, type: 'start_capture', map: (m) => ({ protocolExpr: m[1], portExpr: m[2], fileName: m[3] }) },
    { re: /^FLUSH_TCPDUMP/, type: 'flush_capture' },
    { re: /^END_TCPDUMP/, type: 'stop_capture' },
    { re: /^FLUSH_ALL/, type: 'flush_logs' },
    { re: /^CLEAR_ALL/, type: 'reset_programs' },
    { re: /^get_ports/, type: 'get_ports' },
    { re: /^START_CHECK_PERSISTENT/, type: 'start_persistent' },
    { re: /^PORT_RANGE_RESET/, type: 'port_range_reset' },
    { re: /^WAIT_PORT\s+"([^"]*)"\s+(\S+)/, type: 'wait_port', map: (m) => ({ protocolExpr: m[1], portExpr: m[2] }) },
    { re: /^INPUT\s+"([^"]*)"\s+(\S+)\s+(\S+)\s+(\S+)/, type: 'input', map: (m) => ({ alias: m[1], inputFile: m[2], startLine: m[3], lineCount: m[4] }) },
    { re: /^ISALIVE\s+"([^"]*)"/, type: 'is_alive', map: (m) => ({ alias: m[1] }) },
    { re: /^SAFE_KILL\s+"([^"]*)"/, type: 'stop_program', map: (m) => ({ alias: m[1] }) },
    { re: /^FORCE_KILL_PORT\s+(\S+)/, type: 'force_kill_port', map: (m) => ({ portExpr: m[1] }) },
    { re: /^PORT_RANGE_SET\s+"([^"]*)"\s+"([^"]*)"/, type: 'port_range_set', map: (m) => ({ start: m[1], end: m[2] }) },
    { re: /^END_CHECK_PERSISTENT\s+(\S+)\s+(\S+)/, type: 'end_persistent', map: (m) => ({ maxReconnect: m[1], mode: m[2] }) },
    {
      re: /^COMPILE_RUN\s+"([^"]+)"\s+"([^"]*)"(?:\s+(\S+))?/,
      type: 'compile_run',
      map: (m) => ({ fileRef: parseFileRefFromSource(m[1]), alias: m[2], portExpr: m[3] || '' }),
    },
    {
      re: /^COMPILE_RUN\s+"([^"]+)"\s+(\S+)(?:\s+(\S+))?/,
      type: 'compile_run',
      map: (m) => ({ fileRef: parseFileRefFromSource(m[1]), alias: m[2], portExpr: m[3] || '' }),
    },
    {
      re: /^COMPILE_RUN\s+(\S+)\s+"([^"]*)"(?:\s+(\S+))?/,
      type: 'compile_run',
      map: (m) => ({ fileRef: parseFileRefFromSource(m[1]), alias: m[2], portExpr: m[3] || '' }),
    },
    {
      re: /^COMPILE\s+"([^"]+)"\s+"([^"]*)"/,
      type: 'compile',
      map: (m) => ({ fileRef: parseFileRefFromSource(m[1]), outName: m[2] }),
    },
    { re: /^RUN\s+"([^"]*)"/, type: 'run', map: (m) => ({ outName: m[1] }) },
    { re: /^EVALUATE\s+"([^"]*)"\s+(\S+)(?:\s+(\S+))?/, type: 'evaluate', map: (m) => ({ protocolExpr: m[1], testcaseStart: m[2], testcaseEnd: m[3] || '' }) },
    { re: /^EVALUATE\s+(\S+)\s+(\S+)(?:\s+(\S+))?/, type: 'evaluate', map: (m) => ({ protocolExpr: m[1], testcaseStart: m[2], testcaseEnd: m[3] || '' }) },
    { re: /^CHECK_PORT\s+"([^"]*)"\s+"([^"]*)"\s+"([^"]*)"\s+"([^"]*)"\s+"([^"]*)"(?:\s+"([^"]*)")?/, type: 'check_port', map: (m) => ({ fromExpr: m[1], toExpr: m[2], alias: m[3], protocolExpr: m[4], state: m[5], expectAbsent: m[6] === 'NO' ? 'NO' : '' }) },
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern.re);
    if (match) {
      return { ...newBlock(pattern.type), ...(pattern.map ? pattern.map(match) : {}) };
    }
  }

  return null;
}

export function evalBodyToBlocks(body, testcaseCount = 1) {
  const text = String(body || '').trim();
  if (!text) return newEvalScriptState(testcaseCount);

  const sections = [];
  const sectionRe = /#-+ TEST CASE (\d+)\s+\(([^)]+)\)\s+-+/g;
  let match;
  let lastIndex = 0;
  const matches = [];
  while ((match = sectionRe.exec(text)) !== null) {
    matches.push({ index: match.index, num: match[1], label: match[2] });
  }

  if (!matches.length) {
    const lines = text.split('\n').map(parseLineToBlock).filter(Boolean);
    const splitAt = lines.findIndex((block) => ['start_capture', 'compile_run', 'compile', 'run', 'start_persistent'].includes(block.type));
    const preamble = splitAt > 0 ? lines.slice(0, splitAt) : (splitAt === 0 ? [] : lines.filter((b) => ['set_protocol', 'reduce_port_timeout', 'port_range_set', 'port_range_reset', 'flush_logs'].includes(b.type)));
    const flowBlocks = splitAt >= 0 ? lines.slice(splitAt) : lines.filter((b) => !preamble.includes(b));
    const tailReset = flowBlocks.filter((b) => b.type === 'reset_port_timeout');
    const testcaseBlocks = flowBlocks.filter((b) => !tailReset.includes(b));
    return sanitizeEvalScriptState({
      preamble,
      testCases: [{
        id: createId(),
        label: 'Flow',
        blocks: testcaseBlocks.length ? testcaseBlocks : lines,
      }],
      epilogue: tailReset,
    }, testcaseCount);
  }

  const preambleText = text.slice(0, matches[0].index).trim();
  const preamble = preambleText
    ? preambleText.split('\n').map(parseLineToBlock).filter(Boolean)
    : [];

  matches.forEach((item, idx) => {
    const start = item.index;
    const endMarker = new RegExp(`#=+ END TEST_CASE ${item.num}`, 'i');
    const slice = text.slice(start);
    const endMatch = slice.search(endMarker);
    const sectionBody = endMatch >= 0
      ? slice.slice(0, endMatch)
      : (idx + 1 < matches.length ? text.slice(start, matches[idx + 1].index) : slice);
    const inner = sectionBody
      .split('\n')
      .slice(1)
      .join('\n')
      .trim();
    sections.push({
      id: createId(),
      label: item.label.trim(),
      blocks: inner.split('\n').map(parseLineToBlock).filter(Boolean),
    });
  });

  const last = matches[matches.length - 1];
  const tailStart = text.search(new RegExp(`#=+ END TEST_CASE ${last.num}`, 'i'));
  let epilogue = [];
  if (tailStart >= 0) {
    const after = text.slice(tailStart).replace(new RegExp(`#=+ END TEST_CASE ${last.num}[^\\n]*`), '').trim();
    if (after) epilogue = after.split('\n').map(parseLineToBlock).filter(Boolean);
  }

  return sanitizeEvalScriptState({ preamble, testCases: sections.length ? sections : [{ id: createId(), label: 'Test case 1', blocks: [] }], epilogue }, testcaseCount);
}

export function normalizeEvalScriptState(raw, testcaseCount = 1) {
  if (!raw || typeof raw !== 'object') return newEvalScriptState(testcaseCount);
  const state = {
    preamble: Array.isArray(raw.preamble) ? raw.preamble.map((b) => ({ ...newBlock(b.type), ...b })) : [],
    testCases: Array.isArray(raw.testCases) && raw.testCases.length
      ? raw.testCases.map((tc, index) => ({
        id: tc.id || createId(),
        label: tc.label || `Test case ${index + 1}`,
        blocks: Array.isArray(tc.blocks) ? tc.blocks.map((b) => ({ ...newBlock(b.type), ...b })) : [],
      }))
      : newEvalScriptState(testcaseCount).testCases,
    epilogue: Array.isArray(raw.epilogue) ? raw.epilogue.map((b) => ({ ...newBlock(b.type), ...b })) : [],
  };
  return sanitizeEvalScriptState(state, testcaseCount);
}
