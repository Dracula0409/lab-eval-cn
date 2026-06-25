import { useState } from 'react';
import { PlayIcon } from '@heroicons/react/24/outline';

export default function TestCases({ testCases = [], testCaseResults = [] }) {
  const [expandedTests, setExpandedTests] = useState(new Set([0]));

  const toggleExpanded = (index) => {
    const newExpanded = new Set(expandedTests);
    if (newExpanded.has(index)) newExpanded.delete(index);
    else newExpanded.add(index);
    setExpandedTests(newExpanded);
  };

  const displayCases = testCaseResults.length > 0 ? testCaseResults : testCases;

  if (!displayCases.length) {
    return (
      <div className="p-6 text-center text-gray-500">
        <PlayIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>Run Evaluate to see communication check results.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {displayCases.map((testCase, index) => {
        const isExpanded = expandedTests.has(index);
        const label = testCase.name || testCase.id || `Test Case ${index + 1}`;
        const passed = testCase.passed;
        const hasVerdict = typeof passed === 'boolean';

        return (
          <div key={label + index} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
            <div
              className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
              onClick={() => toggleExpanded(index)}
            >
              <span className="font-medium text-gray-900">{label}</span>
              {hasVerdict && (
                <span className={`px-2 py-1 rounded text-xs font-bold ${passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {passed ? 'All correct' : 'Issues found'}
                </span>
              )}
            </div>

            {isExpanded && (
              <div className="p-4 border-t space-y-3">
                {testCase.pairs?.map((pair, pi) => (
                  <div key={pi} className="text-sm bg-gray-50 rounded p-3">
                    <span className="font-medium">Pair {pi + 1}: </span>
                    seen={pair.seen}, verdict={pair.verdict}
                  </div>
                ))}
                {testCase.output && (
                  <pre className="text-xs bg-yellow-50 border rounded p-3 overflow-x-auto">{testCase.output}</pre>
                )}
                {testCase.error && (
                  <p className="text-sm text-red-600">{testCase.error}</p>
                )}
                {testCase.spec && (
                  <pre className="text-xs bg-blue-50 border rounded p-3 overflow-x-auto">
                    {JSON.stringify(testCase.spec, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
