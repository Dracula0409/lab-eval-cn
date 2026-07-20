export default function TagAssignmentModal({ tags = [], files = [], tagToFileMap, setTagToFileMap, onClose }) {
  if (!tags.length || !files.length) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-6 w-[400px] text-center">
          <p className="text-gray-500">No tags or files available.</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
            Close
          </button>
        </div>
      </div>
    );
  }

  const handleChange = (tag, newFilePath) => {
    setTagToFileMap(prev => ({
      ...prev,
      [tag]: newFilePath
    }));
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-[400px] space-y-4">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Assign File to Each Tag</h2>

        {tags.map(tag => (
          <div key={tag} className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700">{tag}</span>
            <select
              className="ml-2 border rounded px-2 py-1 text-sm"
              value={tagToFileMap[tag] || ''}
              onChange={e => handleChange(tag, e.target.value)}
            >
              <option value="">-- Select File --</option>
              {files.map(f => (
                <option key={f.id} value={f.path}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="flex justify-end pt-4 space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-gray-200 rounded hover:bg-gray-300 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}