import { useState } from 'react';
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
  setCurrentWorkingDir
}) {
  const studentId = localStorage.getItem('studentId'); // set by Login.jsx on sign-in

  const [terminals, setTerminals] = useState([
    { id: 'main', name: 'Main Terminal', buffer: [] }
  ]);

  const [activeTerminalId, setActiveTerminalId] = useState('main');

  const addTerminal = () => {
    const newId = uuidv4();
    const newTerminal = {
      id: newId,
      name: `Terminal ${terminals.length + 1}`,
      buffer: [],
    };
    setTerminals(prev => [...prev, newTerminal]);
    setActiveTerminalId(newId);
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

  const activeTerminal = terminals.find(t => t.id === activeTerminalId) || terminals[0];

  const TerminalRender = terminals.map((term) => (
    <TerminalComponent
      key={term.id}
      isVisible={term.id === activeTerminalId}
      isTermVisible= {termVisible}
      terminalId={term.id}
      initialBuffer={term.buffer}
      onData={chunk => updateBuffer(term.id, chunk)}
      userId={studentId}
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