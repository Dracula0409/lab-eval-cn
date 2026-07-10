import { useState, useEffect } from 'react';
import { CheckCircleIcon, XCircleIcon, CodeBracketIcon, ClockIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';
import { API_BASE } from '../../config';

function SubmissionResults({ results = [], evalError = null }) {
  if (evalError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 whitespace-pre-wrap">
        {evalError}
      </div>
    );
  }

  if (!results.length) {
    return <p className="text-sm text-gray-500 italic">No test case results recorded.</p>;
  }

  const passed = results.filter((r) => r.passed).length;

  return (
    <div className="space-y-3">
      <div className={`rounded-lg border p-3 text-sm font-semibold ${passed === results.length ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
        {passed} / {results.length} test cases passed
      </div>
      {results.map((r) => (
        <div key={r.name} className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
          <span className="font-medium text-gray-800">{r.name}</span>
          <span className={`px-2 py-0.5 rounded text-xs font-bold ${r.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {r.passed ? 'Passed' : 'Failed'}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function Submissions({ userId, questionId, refreshTrigger = 0 }) {
  const [submissions, setSubmissions] = useState([]);
  const [selectedSubmission, setSelectedSubmission] = useState(null);

  useEffect(() => {
    const fetchSubmissions = async () => {
      try {
        const query = new URLSearchParams({ userId, questionId });
        const res = await fetch(`${API_BASE}/api/submission/fetch?${query}`);
        const data = await res.json();
        setSubmissions(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error('[Frontend] Failed to load submissions:', err);
      }
    };

    fetchSubmissions();
  }, [userId, questionId, refreshTrigger]);

  if (selectedSubmission) {
    return (
      <div className="p-6 space-y-4 fade-in-up">
        <button
          className="flex items-center text-sm text-blue-600 hover:underline"
          onClick={() => setSelectedSubmission(null)}
        >
          <ArrowLeftIcon className="w-4 h-4 mr-1" />
          Back to Submissions
        </button>

        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800">Submission Details</h3>
          <span className={`text-sm font-semibold ${selectedSubmission.status === 'Accepted' ? 'text-green-600' : 'text-red-600'}`}>
            {selectedSubmission.passed} / {selectedSubmission.total} passed — {selectedSubmission.status}
          </span>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Test Results</h4>
          <SubmissionResults
            results={selectedSubmission.evaluationResults}
            evalError={selectedSubmission.evalError}
          />
        </div>

        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Submitted Code</h4>
          {selectedSubmission.sourceCode &&
            Object.entries(selectedSubmission.sourceCode).map(([fname, code]) => (
              <div key={fname} className="relative group mb-4">
                <div className="font-mono text-xs text-gray-500 mb-1">
                  <b>{fname}</b>
                </div>
                <button
                  className="absolute top-1 right-1 text-xs px-1 py-0.5 rounded bg-blue-100 text-blue-600 hover:bg-blue-500 hover:text-white transition hidden group-hover:block"
                  onClick={() => navigator.clipboard.writeText(code)}
                >
                  Copy
                </button>
                <pre className="bg-gray-100 border border-gray-200 rounded-lg p-3 text-xs overflow-x-auto whitespace-pre-wrap">
                  {code}
                </pre>
              </div>
            ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4 fade-in-up">
      <h3 className="text-lg font-semibold text-gray-800">Submission History</h3>

      {submissions.length === 0 ? (
        <div className="text-sm text-gray-500 italic">No submissions yet.</div>
      ) : (
        <ul className="divide-y divide-gray-200 rounded-md border border-gray-100 bg-white shadow-sm">
          {submissions.map((submission) => (
            <li
              key={submission.id}
              className="flex justify-between items-center p-4 hover:bg-gray-50 transition-all cursor-pointer"
              onClick={() => setSelectedSubmission(submission)}
            >
              <div className="flex items-center space-x-3">
                {submission.status === 'Accepted' ? (
                  <CheckCircleIcon className="w-5 h-5 text-green-500" />
                ) : (
                  <XCircleIcon className="w-5 h-5 text-red-500" />
                )}
                <div>
                  <div className="font-medium text-sm text-gray-800">
                    {submission.status}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center space-x-2">
                    <ClockIcon className="w-4 h-4 text-gray-400" />
                    <span>{submission.timestamp}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <div className="flex items-center space-x-1">
                  <CodeBracketIcon className="w-4 h-4 text-blue-500" />
                  <span>{submission.language}</span>
                </div>
                <div className="text-xs font-mono text-gray-700">
                  {submission.passed} / {submission.total} Test Cases
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
