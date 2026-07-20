import { useEffect, useState } from 'react';
import TerminalTabs from './TerminalTabs';
import TerminalComponent from './Terminal';
import { v4 as uuidv4 } from 'uuid';
// import {
//   CommandLineIcon,
//   XMarkIcon,
//   PlusIcon
// } from '@heroicons/react/24/outline';

export default function TerminalPane({ 
  onClose,
  termVisible,
  setCurrentWorkingDir = () => {},
  sessionId = ''
}) {
  const [terminals, setTerminals] = useState([
    { id: 'main', name: 'Main Terminal', buffer: [] }
  ]);

  const [activeTerminalId, setActiveTerminalId] = useState('main');

  const createTerminal = ({ name } = {}) => {
    const newId = uuidv4();
    const newTerminal = {
      id: newId,
      name: name || `Terminal ${terminals.length + 1}`,
      buffer: [],
    };
    setTerminals(prev => [...prev, newTerminal]);
    setActiveTerminalId(newId);
    return newId;
  };

  const addTerminal = () => {
    createTerminal();
  };

  const closeTerminal = (terminalId) => {
    if (terminals.length <= 1) return;
    setTerminals(terminals.filter(t => t.id !== terminalId));
    if (activeTerminalId === terminalId) {
      const remaining = terminals.filter(t => t.id !== terminalId);
      setActiveTerminalId(remaining[0]?.id || 'main');
    }
  };

  const updateBuffer = (termId, chunk) => {
    setTerminals(ts => 
      ts.map(t => t.id === termId
        ? { ...t, buffer: [...t.buffer, chunk] }
        : t
      )
    )
  }

  useEffect(() => {
    const onOpenRunTerminal = (event) => {
      const runId = createTerminal({ name: event.detail?.filename ? `Run ${event.detail.filename}` : 'Run' });
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('run-file-in-terminal', {
          detail: {
            ...event.detail,
            targetTerminalId: runId,
            sessionId,
          },
        }));
      }, 500);
    };

    window.addEventListener('open-run-terminal', onOpenRunTerminal);
    return () => window.removeEventListener('open-run-terminal', onOpenRunTerminal);
  }, [sessionId, terminals.length]);

  const TerminalRender = terminals.map((term) => (
    <TerminalComponent
      key={term.id}
      isVisible={term.id === activeTerminalId}
      isTermVisible= {termVisible}
      terminalId={term.id}
      sessionId={sessionId}
      initialBuffer={term.buffer}
      onData={chunk => updateBuffer(term.id, chunk)}
      setCurrentWorkingDir={(termId, cwd) => setCurrentWorkingDir(cwd)} 
    />
  ));

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <TerminalTabs
        terminals={terminals}
        activeTerminalId={activeTerminalId}
        setActiveTerminalId={setActiveTerminalId}
        closeTerminal={closeTerminal}
        onClose={onClose}
        setTerminals={setTerminals}
        addTerminal={addTerminal}
      />

      {TerminalRender}
    </div>
  );
}
