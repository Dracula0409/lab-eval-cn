import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { PlusIcon, Bars3Icon, XMarkIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import {
  BLOCK_CATALOG,
  blockCategoryColor,
  blockInlineLabel,
  blocksToEvalBody,
  buildAliasOptions,
  buildFileRefOptions,
  buildFullNiceSh,
  buildPortExprOptions,
  CONNECTION_STATES,
  evalBodyToBlocks,
  extractEvalBodyFromNiceSh,
  newBlock,
  newEvalScriptState,
  normalizeEvalScriptState,
  previewBlockLine,
  sanitizeEvalScriptState,
  syncTestcaseSectionCount,
} from './evalScriptBuilderUtils';

const stableJson = (value) => JSON.stringify(value || {});

function reorder(list, fromIndex, toIndex) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

function parseDragPayload(event) {
  try {
    const raw = event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setDragPayload(event, payload) {
  const json = JSON.stringify(payload);
  event.dataTransfer.setData('application/json', json);
  event.dataTransfer.setData('text/plain', json);
  event.dataTransfer.effectAllowed = payload.source === 'palette' ? 'copy' : 'move';
}

export default function EvalScriptBuilder({
  evalScript,
  niceScript,
  evalScriptBlocks,
  questionKey,
  files,
  testcaseSocketConfig,
  testcases,
  setValue,
}) {
  const testcaseCount = useMemo(
    () => Math.max(1, Object.keys(testcases || {}).length || 1),
    [testcases],
  );
  const [tab, setTab] = useState('blocks');
  const [state, setState] = useState(() => {
    if (niceScript) return evalBodyToBlocks(extractEvalBodyFromNiceSh(niceScript) || niceScript, testcaseCount);
    if (evalScriptBlocks && typeof evalScriptBlocks === 'object') {
      return normalizeEvalScriptState(evalScriptBlocks, testcaseCount);
    }
    return evalBodyToBlocks(evalScript, testcaseCount);
  });
  const [scriptText, setScriptText] = useState(() => niceScript || buildFullNiceSh({ questionKey: questionKey || 'q1', evalBody: evalScript }));
  const [scriptError, setScriptError] = useState('');
  const activeSectionRef = useRef('tc-0');
  const lastSignature = useRef(stableJson({ evalScript, evalScriptBlocks, niceScript }));
  const lastTestcaseCount = useRef(testcaseCount);
  const stateRef = useRef(state);
  stateRef.current = state;

  const fileRefOptions = useMemo(() => buildFileRefOptions(files), [files]);
  const portOptions = useMemo(() => buildPortExprOptions(testcaseSocketConfig), [testcaseSocketConfig]);
  const aliasOptions = useMemo(() => buildAliasOptions(state), [state]);

  const publish = (nextState) => {
    const normalized = sanitizeEvalScriptState(normalizeEvalScriptState(nextState, testcaseCount), testcaseCount);
    const body = blocksToEvalBody(normalized, files);
    const full = buildFullNiceSh({ questionKey: questionKey || 'q1', evalBody: body });
    lastSignature.current = stableJson({ evalScript: body, evalScriptBlocks: normalized, niceScript: full });
    setState(normalized);
    setScriptText(full);
    setScriptError('');
    setValue('evalScript', body, { shouldDirty: true });
    setValue('evalScriptBlocks', normalized, { shouldDirty: true });
    setValue('niceScript', full, { shouldDirty: true });
  };

  const appendBlockToActive = (type) => {
    const key = activeSectionRef.current;
    if (key === 'protocol') return;
    if (key.startsWith('tc-')) {
      const index = Number.parseInt(key.slice(3), 10);
      publish({
        ...stateRef.current,
        testCases: stateRef.current.testCases.map((tc, i) => i === index
          ? { ...tc, blocks: [...(tc.blocks || []), newBlock(type)] }
          : tc),
      });
      return;
    }
    const tcIndex = Math.max(0, stateRef.current.testCases.length - 1);
    publish({
      ...stateRef.current,
      testCases: stateRef.current.testCases.map((tc, i) => i === tcIndex
        ? { ...tc, blocks: [...(tc.blocks || []), newBlock(type)] }
        : tc),
    });
  };

  useEffect(() => {
    const signature = stableJson({ evalScript, evalScriptBlocks, niceScript });
    if (signature === lastSignature.current) return;
    lastSignature.current = signature;
    const nextState = niceScript
      ? evalBodyToBlocks(extractEvalBodyFromNiceSh(niceScript) || niceScript, testcaseCount)
      : evalScriptBlocks && typeof evalScriptBlocks === 'object'
      ? normalizeEvalScriptState(evalScriptBlocks, testcaseCount)
      : evalBodyToBlocks(evalScript, testcaseCount);
    setState(nextState);
    setScriptText(niceScript || buildFullNiceSh({ questionKey: questionKey || 'q1', evalBody: blocksToEvalBody(nextState, files) }));
  }, [evalScript, evalScriptBlocks, niceScript, testcaseCount, questionKey, files]);

  useEffect(() => {
    if (!scriptText) {
      setScriptText(niceScript || buildFullNiceSh({ questionKey: questionKey || 'q1', evalBody: blocksToEvalBody(state, files) }));
    }
  }, []);

  useEffect(() => {
    if (lastTestcaseCount.current === testcaseCount) return;
    lastTestcaseCount.current = testcaseCount;
    // A testcase-file edit must never rewrite an independently authored
    // nice.sh.  Keep the visual sections aligned for editing, but only write
    // a new script when the teacher intentionally changes a flow block.
    setState(syncTestcaseSectionCount(stateRef.current, testcaseCount));
  }, [testcaseCount]);

  const paletteByCategory = useMemo(() => {
    const map = new Map();
    BLOCK_CATALOG.filter((e) => e.type !== 'set_protocol').forEach((entry) => {
      if (!map.has(entry.category)) map.set(entry.category, []);
      map.get(entry.category).push(entry);
    });
    return [...map.entries()];
  }, []);

  const protocolBlock = state.preamble?.[0] || newBlock('set_protocol');

  return (
    <div className="border rounded-lg bg-white overflow-hidden">
      <div className="flex border-b bg-gray-50 px-3 pt-2 gap-2">
        <button type="button" onClick={() => setTab('blocks')} className={`px-3 py-2 text-sm font-medium rounded-t ${tab === 'blocks' ? 'bg-white border border-b-white -mb-px text-indigo-700' : 'text-gray-600'}`}>Flow blocks</button>
        <button type="button" onClick={() => setTab('script')} className={`px-3 py-2 text-sm font-medium rounded-t ${tab === 'script' ? 'bg-white border border-b-white -mb-px text-indigo-700' : 'text-gray-600'}`}>nice.sh</button>
      </div>

      {tab === 'script' ? (
        <div className="p-4">
          <p className="text-sm text-gray-600 mb-3">This is the complete saved file. Manual changes are authoritative; the flow view is a best-effort interpretation of the script.</p>
          <Editor height="420px" language="shell" value={scriptText} onChange={(v) => { setScriptText(v ?? ''); setScriptError(''); }} options={{ minimap: { enabled: false }, fontSize: 13, wordWrap: 'on' }} />
          {scriptError && <p className="text-sm text-red-600 mt-2">{scriptError}</p>}
          <button type="button" onClick={() => {
            try {
              const body = extractEvalBodyFromNiceSh(scriptText);
              const nextState = evalBodyToBlocks(body || scriptText, testcaseCount);
              // Never regenerate a manually authored script here.  Persist the
              // exact content and let blocks be a derived, editable view.
              lastSignature.current = stableJson({ evalScript: body || scriptText, evalScriptBlocks: nextState, niceScript: scriptText });
              setValue('niceScript', scriptText, { shouldDirty: true });
              setValue('evalScript', body || scriptText, { shouldDirty: true });
              setValue('evalScriptBlocks', nextState, { shouldDirty: true });
              setState(nextState);
              setScriptError('');
              setTab('blocks');
            } catch (error) {
              setScriptError(error.message);
            }
          }} className="mt-3 px-3 py-2 rounded bg-indigo-600 text-white text-sm">Apply script to blocks</button>
        </div>
      ) : (
        <div className="p-3 grid lg:grid-cols-[190px_1fr] gap-3">
          <datalist id="eval-alias-list">{aliasOptions.map((opt) => <option key={opt.value} value={opt.value} />)}</datalist>

          <aside className="space-y-2 max-h-[70vh] overflow-y-auto">
            <p className="text-[11px] text-gray-500">Click or drag into a test case script. Editing blocks regenerates nice.sh; direct script edits remain unchanged.</p>
            {paletteByCategory.map(([category, entries]) => (
              <div key={category}>
                <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-1">{category}</h4>
                <ul className="space-y-0.5">
                  {entries.map((entry) => (
                    <li key={entry.type}>
                      <button
                        type="button"
                        draggable
                        onClick={() => appendBlockToActive(entry.type)}
                        onDragStart={(e) => setDragPayload(e, { source: 'palette', type: entry.type })}
                        className="w-full text-left cursor-grab active:cursor-grabbing text-[11px] font-medium rounded-md px-2 py-1 text-white shadow-sm hover:brightness-110"
                        style={{ backgroundColor: blockCategoryColor(entry.type) }}
                        title={`${entry.description} — click to add`}
                      >
                        {entry.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <button type="button" onClick={() => publish(newEvalScriptState(testcaseCount))} className="w-full text-[11px] border rounded py-1.5 text-gray-600 hover:bg-gray-50">Reset template</button>
          </aside>

          <div className="space-y-3 min-w-0 max-h-[70vh] overflow-y-auto">
            <div className="eval-scratch-stack" onFocus={() => { activeSectionRef.current = 'protocol'; }}>
              <ScratchBlock
                block={protocolBlock}
                files={files}
                fileRefOptions={fileRefOptions}
                portOptions={portOptions}
                isFirst
                isLast
                onPatch={(patch) => publish({ ...state, preamble: [{ ...protocolBlock, ...patch }] })}
                onRemove={null}
                onMoveUp={null}
                onMoveDown={null}
                dragProps={{}}
              />
            </div>

            {state.testCases.map((testCase, caseIndex) => (
              <section key={testCase.id} className="rounded-lg border border-indigo-200 overflow-hidden" onMouseDown={() => { activeSectionRef.current = `tc-${caseIndex}`; }}>
                <div className="flex items-center gap-2 px-2 py-1 bg-indigo-50 border-b border-indigo-100">
                  <span className="text-xs font-bold text-indigo-800">TC {caseIndex + 1}</span>
                  <input
                    value={testCase.label}
                    onChange={(e) => publish({
                      ...state,
                      testCases: state.testCases.map((item, i) => i === caseIndex ? { ...item, label: e.target.value } : item),
                    })}
                    className="flex-1 border-0 bg-transparent text-xs text-indigo-900 focus:ring-1 focus:ring-indigo-300 rounded px-1"
                    placeholder="Label"
                  />
                  <button type="button" onClick={() => publish({ ...state, testCases: state.testCases.filter((_, i) => i !== caseIndex) })} className="text-indigo-400 hover:text-red-600"><XMarkIcon className="w-3.5 h-3.5" /></button>
                </div>
                <BlockStack
                  blocks={testCase.blocks}
                  files={files}
                  fileRefOptions={fileRefOptions}
                  portOptions={portOptions}
                  sectionKey={`tc-${caseIndex}`}
                  onFocus={() => { activeSectionRef.current = `tc-${caseIndex}`; }}
                  onChange={(blocks) => publish({
                    ...state,
                    testCases: state.testCases.map((item, i) => i === caseIndex ? { ...item, blocks } : item),
                  })}
                />
              </section>
            ))}

            <button type="button" onClick={() => publish({
              ...state,
              testCases: [...state.testCases, {
                id: crypto.randomUUID?.() ?? String(Date.now()),
                label: `Test case ${state.testCases.length + 1}`,
                blocks: defaultNewTcBlocks(state.testCases.length),
              }],
            })} className="inline-flex items-center px-2 py-1 bg-indigo-600 text-white rounded text-xs">
              <PlusIcon className="w-3.5 h-3.5 mr-1" /> Add test case
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function defaultNewTcBlocks(index) {
  return [
    newBlock('start_capture'),
    newBlock('sleep'),
    { ...newBlock('evaluate'), testcaseStart: String(index + 1) },
  ];
}

function BlockStack({ blocks, files, fileRefOptions, portOptions, sectionKey, onFocus, onChange }) {
  const [dropIndex, setDropIndex] = useState(null);
  const dragFromRef = useRef(null);

  const insertAt = (index, type) => {
    const next = [...(blocks || [])];
    next.splice(index, 0, newBlock(type));
    onChange(next);
  };

  const handleDrop = (event, index) => {
    event.preventDefault();
    event.stopPropagation();
    const payload = parseDragPayload(event) || dragFromRef.current;
    if (!payload) return;
    if (payload.source === 'palette' && payload.type) {
      insertAt(index, payload.type);
    } else if (payload.source === 'list' && payload.index != null) {
      const from = payload.index;
      let to = index;
      if (from < to) to -= 1;
      if (from !== to) onChange(reorder(blocks, from, to));
    }
    dragFromRef.current = null;
    setDropIndex(null);
  };

  return (
    <div className="p-2" onFocus={onFocus} onMouseDown={onFocus}>
      <div
        className="eval-scratch-stack"
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={(e) => handleDrop(e, blocks?.length || 0)}
      >
        {!blocks?.length && <p className="text-[11px] text-gray-400 text-center py-2">Click a block on the left or drop here</p>}
        {blocks?.map((block, index) => (
          <div key={block.id}>
            <DropSlot active={dropIndex === index} onEnter={() => setDropIndex(index)} onDrop={(e) => handleDrop(e, index)} />
            <ScratchBlock
              block={block}
              files={files}
              fileRefOptions={fileRefOptions}
              portOptions={portOptions}
              isFirst={index === 0}
              isLast={index === blocks.length - 1}
              onPatch={(patch) => onChange(blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)))}
              onRemove={() => onChange(blocks.filter((_, i) => i !== index))}
              onMoveUp={index > 0 ? () => onChange(reorder(blocks, index, index - 1)) : null}
              onMoveDown={index < blocks.length - 1 ? () => onChange(reorder(blocks, index, index + 1)) : null}
              dragProps={{
                draggable: true,
                onDragStart: (e) => {
                  const payload = { source: 'list', index, sectionKey };
                  setDragPayload(e, payload);
                  dragFromRef.current = payload;
                },
                onDragEnd: () => { dragFromRef.current = null; setDropIndex(null); },
              }}
            />
          </div>
        ))}
        <DropSlot active={dropIndex === (blocks?.length || 0)} onEnter={() => setDropIndex(blocks?.length || 0)} onDrop={(e) => handleDrop(e, blocks?.length || 0)} />
      </div>
    </div>
  );
}

function DropSlot({ active, onEnter, onDrop }) {
  return (
    <div
      className={`eval-scratch-slot ${active ? 'eval-scratch-slot-active' : ''}`}
      onDragEnter={(e) => { e.preventDefault(); onEnter(); }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); onEnter(); }}
      onDrop={onDrop}
    />
  );
}

function ScratchBlock({
  block, files, fileRefOptions, portOptions, isFirst, isLast, onPatch, onRemove, onMoveUp, onMoveDown, dragProps = {},
}) {
  const color = blockCategoryColor(block.type);
  const preview = previewBlockLine(block, files);

  return (
    <div
      className={`eval-scratch-block ${isFirst ? 'eval-scratch-first' : ''}`}
      style={{ backgroundColor: color, zIndex: isLast ? 2 : 1 }}
    >
      <div
        {...dragProps}
        className="cursor-grab active:cursor-grabbing p-0.5 shrink-0 touch-none"
        title={preview}
      >
        <Bars3Icon className="w-3.5 h-3.5 opacity-80" />
      </div>

      <span className="shrink-0">{blockInlineLabel(block.type)}</span>

      <InlineFields block={block} onPatch={onPatch} fileRefOptions={fileRefOptions} portOptions={portOptions} />

      <div className="ml-auto flex items-center gap-0.5 shrink-0">
        {onMoveUp && (
          <button type="button" onClick={onMoveUp} className="p-0.5 opacity-70 hover:opacity-100" title="Move up"><ChevronUpIcon className="w-3 h-3" /></button>
        )}
        {onMoveDown && (
          <button type="button" onClick={onMoveDown} className="p-0.5 opacity-70 hover:opacity-100" title="Move down"><ChevronDownIcon className="w-3 h-3" /></button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="p-0.5 opacity-70 hover:opacity-100" title="Remove"><XMarkIcon className="w-3 h-3" /></button>
        )}
      </div>
    </div>
  );
}

function InlineFields({ block, onPatch, fileRefOptions, portOptions }) {
  const stop = (e) => e.stopPropagation();
  const fileShort = (ref) => fileRefOptions.find((o) => o.value === ref)?.label?.split(' → ')[0]?.replace(/^(Server|Client):\s*/, '') || ref;
  const portsWithValues = portOptions.filter((o) => o.value);

  switch (block.type) {
    case 'set_protocol':
      return (
        <select value={block.protocol} onChange={(e) => onPatch({ protocol: e.target.value })} className="eval-scratch-input" onMouseDown={stop}>
          <option value="tcp">tcp</option>
          <option value="udp">udp</option>
        </select>
      );
    case 'compile_run':
      return <>
        <select value={block.fileRef} onChange={(e) => onPatch({ fileRef: e.target.value })} className="eval-scratch-input" onMouseDown={stop}>
          {fileRefOptions.map((o) => <option key={o.value} value={o.value}>{fileShort(o.value)}</option>)}
        </select>
        <span className="opacity-90 font-normal">as</span>
        <input list="eval-alias-list" value={block.alias} onChange={(e) => onPatch({ alias: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />
        <select value={block.portExpr || ''} onChange={(e) => onPatch({ portExpr: e.target.value })} className="eval-scratch-input" onMouseDown={stop}>
          {portOptions.map((o) => <option key={o.value || 'none'} value={o.value}>{o.label}</option>)}
        </select>
      </>;
    case 'compile':
      return <>
        <select value={block.fileRef} onChange={(e) => onPatch({ fileRef: e.target.value })} className="eval-scratch-input" onMouseDown={stop}>{fileRefOptions.map((o) => <option key={o.value} value={o.value}>{fileShort(o.value)}</option>)}</select>
        <input value={block.outName} onChange={(e) => onPatch({ outName: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />
      </>;
    case 'run':
    case 'is_alive':
    case 'stop_program':
      return <input list="eval-alias-list" value={block.alias || block.outName || ''} onChange={(e) => onPatch(block.type === 'run' ? { outName: e.target.value } : { alias: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />;
    case 'input':
      return <>
        <input list="eval-alias-list" value={block.alias} onChange={(e) => onPatch({ alias: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />
        <span className="opacity-90 font-normal">line</span>
        <input value={block.startLine} onChange={(e) => onPatch({ startLine: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />
        <span className="opacity-90 font-normal">×</span>
        <input value={block.lineCount} onChange={(e) => onPatch({ lineCount: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />
      </>;
    case 'sleep':
      return <>
        <input type="number" min="0" step="0.1" value={block.seconds} onChange={(e) => onPatch({ seconds: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />
        <span className="opacity-90 font-normal">sec</span>
      </>;
    case 'start_capture':
      return <>
        <select value={block.portExpr} onChange={(e) => onPatch({ portExpr: e.target.value })} className="eval-scratch-input" onMouseDown={stop}>
          {portsWithValues.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input value={block.fileName} onChange={(e) => onPatch({ fileName: e.target.value })} className="eval-scratch-input" placeholder="pcap" onMouseDown={stop} />
      </>;
    case 'wait_port':
      return (
        <select value={block.portExpr || ''} onChange={(e) => onPatch({ portExpr: e.target.value })} className="eval-scratch-input" onMouseDown={stop}>
          {portsWithValues.length ? portsWithValues.map((o) => <option key={o.value} value={o.value}>{o.label}</option>) : (
            <>
              <option value="${SERVER_PORT[0]}">SERVER_PORT[0]</option>
              <option value="${CLIENT_PORT[0]}">CLIENT_PORT[0]</option>
            </>
          )}
        </select>
      );
    case 'check_port':
      return <>
        <input list="eval-alias-list" value={block.alias} onChange={(e) => onPatch({ alias: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />
        <select value={block.state} onChange={(e) => onPatch({ state: e.target.value })} className="eval-scratch-input" onMouseDown={stop}>{CONNECTION_STATES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select value={block.expectAbsent} onChange={(e) => onPatch({ expectAbsent: e.target.value })} className="eval-scratch-input" onMouseDown={stop}>
          <option value="">connected</option>
          <option value="NO">absent OK</option>
        </select>
      </>;
    case 'evaluate':
      return <>
        <span className="opacity-90 font-normal">#</span>
        <input value={block.testcaseStart} onChange={(e) => onPatch({ testcaseStart: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />
      </>;
    case 'force_kill_port':
      return (
        <select value={block.portExpr} onChange={(e) => onPatch({ portExpr: e.target.value })} className="eval-scratch-input" onMouseDown={stop}>
          {portsWithValues.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    case 'custom_bash':
      return <textarea
        value={block.line}
        onChange={(e) => onPatch({ line: e.target.value })}
        className="eval-scratch-input font-mono"
        style={{ minWidth: 260, minHeight: 64, maxWidth: 520, resize: 'vertical' }}
        placeholder={'Any bash command(s), e.g.\necho "starting"\nexport FLAG=1'}
        aria-label="Custom bash commands"
        onMouseDown={stop}
      />;
    case 'end_persistent':
      return <>
        <select value={block.mode} onChange={(e) => onPatch({ mode: e.target.value })} className="eval-scratch-input" onMouseDown={stop}><option value="persistent">persistent</option><option value="non-persistent">non-persistent</option></select>
        <input value={block.maxReconnect} onChange={(e) => onPatch({ maxReconnect: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />
      </>;
    case 'port_range_set':
      return <>
        <input value={block.start} onChange={(e) => onPatch({ start: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />
        <span className="opacity-90 font-normal">–</span>
        <input value={block.end} onChange={(e) => onPatch({ end: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />
      </>;
    case 'assign_port':
      return <>
        <input value={block.appName} onChange={(e) => onPatch({ appName: e.target.value })} className="eval-scratch-input eval-scratch-input-narrow" onMouseDown={stop} />
        <select value={block.portExpr} onChange={(e) => onPatch({ portExpr: e.target.value })} className="eval-scratch-input" onMouseDown={stop}>{portsWithValues.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
      </>;
    default:
      return null;
  }
}
