import TestCases from './TestCases';

export default function TestSelector({
  question,
  testCaseResults = [],
  evalMessage = null,
  connResults = [],
  isEvaluating = false,
}) {
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
        <h3 className="text-lg font-semibold text-gray-900">Test Cases</h3>
        <p className="text-xs text-gray-500 mt-1">
          Click Evaluate to run your code against these cases (results are not saved).
        </p>
      </div>

      <TestCases
        testCases={testcaseEntries}
        testCaseResults={results}
        evalMessage={evalMessage}
        connResults={connResults}
        isEvaluating={isEvaluating}
      />
    </div>
  );
}
