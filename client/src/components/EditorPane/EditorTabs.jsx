import { useState } from 'react';
import { 
  XMarkIcon,
  DocumentIcon,
  CodeBracketIcon,
  GlobeAltIcon,
  PaintBrushIcon,
  ClipboardDocumentIcon,
  PencilSquareIcon,
  BoltIcon,
  WrenchIcon
} from '@heroicons/react/24/outline';

export default function EditorTabs({ 
  files, 
  activeFileId, 
  setActiveFileId,
  onCloseFile,
  setFiles
}) {
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'py': return <CodeBracketIcon className="w-4 h-4 text-green-600" />;
      case 'js': return <CodeBracketIcon className="w-4 h-4 text-yellow-500" />;
      case 'java': return <BoltIcon className="w-4 h-4 text-orange-600" />;
      case 'cpp':
      case 'cc':
      case 'cxx': return <BoltIcon className="w-4 h-4 text-blue-600" />;
      case 'c': return <WrenchIcon className="w-4 h-4 text-gray-700" />;
      case 'html': return <GlobeAltIcon className="w-4 h-4 text-pink-500" />;
      case 'css': return <PaintBrushIcon className="w-4 h-4 text-indigo-500" />;
      case 'json': return <ClipboardDocumentIcon className="w-4 h-4 text-gray-500" />;
      case 'md': return <PencilSquareIcon className="w-4 h-4 text-blue-400" />;
      default: return <DocumentIcon className="w-4 h-4 text-gray-400" />;
    }
  };

  const startRename = (fileId, currentName) => {
    setEditingId(fileId);
    setEditName(currentName);
  };

  const finishRename = () => {
    if (editingId && editName.trim()) {
      setFiles(prevFiles =>
        prevFiles.map(f =>
          f.id === editingId ? { ...f, name: editName.trim() } : f
        )
      );
    }
    setEditingId(null);
    setEditName('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      finishRename();
    } else if (e.key === 'Escape') {
      setEditingId(null);
      setEditName('');
    }
  };

  const closeFile = (fileId, e) => {
    e.stopPropagation();
    if (onCloseFile) {
      onCloseFile(fileId);
    }
    console.log('Close file:', fileId);
  };

  if (!files.length) {
    return (
      <div className="flex items-center justify-center h-12 bg-gray-50 border-b border-gray-200">
        <span className="text-sm text-gray-500">No files open</span>
      </div>
    );
  }

  return (
    <div className="flex bg-gray-100 border-b border-gray-200 overflow-x-auto">
      {files.map((file) => (
        <div
          key={file.id}
          className={`
            group relative flex items-center min-w-0 px-3 py-2 border-r border-gray-200 cursor-pointer transition-colors
            ${activeFileId === file.id 
              ? 'bg-white text-gray-900 border-b-2 border-blue-600' 
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }
          `}
          onClick={() => setActiveFileId(file.id)}
        >
          <span className="mr-2 text-sm flex items-center">{getFileIcon(file.name)}</span>
          
          {editingId === file.id ? (
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={finishRename}
              onKeyDown={handleKeyDown}
              className="bg-transparent border-none outline-none text-sm min-w-0 flex-1"
              autoFocus
            />
          ) : (
            <>
              <span 
                className="text-sm truncate max-w-32"
                onDoubleClick={() => startRename(file.id, file.name)}
                title={file.name}
              >
                {file.name}
              </span>

              {files.length > 1 && (
                <button
                  onClick={(e) => closeFile(file.id, e)}
                  className="ml-2 p-0.5 text-gray-400 hover:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Close file"
                >
                  <XMarkIcon className="w-3 h-3" />
                </button>
              )}
            </>
          )}

          {/* Modified indicator */}
          {file.modified && (
            <div className="w-2 h-2 bg-blue-600 rounded-full ml-1" title="Modified" />
          )}
        </div>
      ))}
      
      {/* Add visual indicator for active tab */}
      {/* <div className="flex-1 bg-gray-100" /> */}
    </div>
  );
}