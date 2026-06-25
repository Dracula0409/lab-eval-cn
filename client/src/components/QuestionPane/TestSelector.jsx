import TestCases from './TestCases';

export default function TestSelector({ question, testCaseResults = [] }) {
  const testcaseEntries = question?.testcases
    ? Object.entries(question.testcases).map(([name, spec]) => ({
        id: name,
        name,
        spec,
      }))
    : [];

  const results = Array.isArray(testCaseResults) ? testCaseResults : [];

  return (
    <div className="fade-in-up">
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <h3 className="text-lg font-semibold text-gray-900">Communication Checks</h3>
        <p className="text-xs text-gray-500 mt-1">
          Results help the teacher verify protocol behaviour — they do not assign marks automatically.
        </p>
      </div>

      {results.length > 0 ? (
        <TestCases testCases={testcaseEntries} testCaseResults={results} />
      ) : testcaseEntries.length > 0 ? (
        <TestCases testCases={testcaseEntries} testCaseResults={[]} />
      ) : (
        <div className="p-6 text-center text-gray-500">
          <p>No testcases defined for this question.</p>
        </div>
      )}
    </div>
  );
}
