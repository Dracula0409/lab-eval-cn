import { useState } from 'react';
import { PlayIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { parseJsonTestcase, formatTestcaseName } from '../utils/testcaseHelper';

export default function TestCases({
  testCases = [],
  testCaseResults = [],
  evalMessage = null,
  connResults = [],
  isEvaluating = false,
}) {
  const [expandedTests, setExpandedTests] = useState(new Set([0]));

  const toggleExpanded = (index) => {
    const newExpanded = new Set(expandedTests);
    if (newExpanded.has(index)) newExpanded.delete(index);
    else newExpanded.add(index);
    setExpandedTests(newExpanded);
  };

  const hasResults = testCaseResults.length > 0;
  const passedCount = testCaseResults.filter((r) => r.passed).length;
  const totalResults = testCaseResults.length;

  const buildFromSpec = (name, spec) => ({
    name,
    spec,
    friendlySteps: parseJsonTestcase(spec),
  });

  const specList = Array.isArray(testCases)
    ? testCases.map((tc) => buildFromSpec(tc.name || tc.id, tc.spec || tc))
    : Object.entries((testCases && (testCases.q1 || testCases)) || {}).map(([name, spec]) =>
        buildFromSpec(name, spec)
      );

  const mergedCases = hasResults
    ? testCaseResults.map((result) => {
        const specEntry = specList.find(
          (tc) => tc.name === result.name || tc.name === result.fullName
        );
        return {
          ...result,
          spec: specEntry?.spec,
          friendlySteps: specEntry?.friendlySteps?.length
            ? specEntry.friendlySteps
            : parseJsonTestcase(specEntry?.spec),
        };
      })
    : specList;

  if (!mergedCases.length && !isEvaluating) {
    return (
      <div className="p-6 text-center text-gray-500">
        <PlayIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>{evalMessage || 'No test cases defined for this question.'}</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {isEvaluating && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-center gap-2 text-blue-800 text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
          Running evaluation… check the terminal for live output.
        </div>
      )}

      {hasResults && (
        <div
          className={`rounded-lg border p-4 ${
            passedCount === totalResults && totalResults > 0
              ? 'bg-green-50 border-green-200'
              : 'bg-amber-50 border-amber-200'
          }`}
        >
          <div className="flex items-center gap-2 font-semibold text-gray-900">
            {passedCount === totalResults && totalResults > 0 ? (
              <CheckCircleIcon className="w-5 h-5 text-green-600" />
            ) : (
              <XCircleIcon className="w-5 h-5 text-amber-600" />
            )}
            <span>
              {passedCount} / {totalResults} test cases passed
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            Evaluate results are shown here only and are not saved.
          </p>
        </div>
      )}

      {connResults.length > 0 && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <h4 className="text-sm font-semibold text-indigo-900 mb-2">Connection Checks</h4>
          <div className="space-y-1">
            {connResults.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="font-mono text-gray-700">
                  {c.entity}
                  {c.peer ? ` → ${c.peer}` : ''} ({c.state})
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-xs font-bold ${
                    c.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {c.verdict}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {evalMessage && !hasResults && !isEvaluating && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {evalMessage}
        </div>
      )}

      {mergedCases.map((testCase, index) => {
        const isExpanded = expandedTests.has(index);
        const label = formatTestcaseName(testCase.name || testCase.id || `testcase${index + 1}`);
        const passed = testCase.passed;
        const hasVerdict = typeof passed === 'boolean';

        return (
          <div
            key={(testCase.name || '') + index}
            className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm"
          >
            <div
              className="flex items-center justify-between p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
              onClick={() => toggleExpanded(index)}
            >
              <span className="font-medium text-gray-900">{label}</span>
              {hasVerdict && (
                <span
                  className={`px-2 py-1 rounded text-xs font-bold ${
                    passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}
                >
                  {passed ? 'Passed' : 'Failed'}
                </span>
              )}
            </div>

            {isExpanded && (
              <div className="p-4 border-t space-y-3">
                {(testCase.friendlySteps || []).length > 0 ? (
                  (testCase.friendlySteps || []).map((step, si) => (
                    <div key={si} className="text-sm bg-gray-50 rounded p-3 font-mono">
                      <span className="font-semibold text-indigo-700">{step.label}:</span>{' '}
                      <span className="text-gray-800">
                        {typeof step.value === 'string' ? step.value : JSON.stringify(step.value)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-500 italic">No steps defined.</p>
                )}

                {hasVerdict && testCase.output && (
                  <pre className="text-xs bg-yellow-50 border rounded p-3 overflow-x-auto whitespace-pre-wrap">
                    {testCase.output}
                  </pre>
                )}
                {hasVerdict && testCase.error && (
                  <p className="text-sm text-red-600">{testCase.error}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
