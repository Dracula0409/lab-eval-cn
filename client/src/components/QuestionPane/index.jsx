import { useState, useEffect } from 'react';
import Submissions from './Submissions';
import TestSelector from './TestSelector';
import QuestionTabs from './QuestionTabs';
import { processCodeBlocks } from '../utils/codeBlockHelper';
import { 
  XMarkIcon,
  AcademicCapIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline';

export default function QuestionPane({ 
  questions, 
  activeQuestionIdx, 
  setActiveQuestionIdx, 
  onClose, 
  testCaseResults 
}) {
  if (!questions || !Array.isArray(questions) || questions.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-500 bg-gradient-to-br from-slate-50 to-white">
        No questions available.
      </div>
    );
  }
  const [activeTab, setActiveTab] = useState('description');
  const question = questions[activeQuestionIdx];
  const [processedDescription, setProcessedDescription] = useState('');
  
  // Process description to fix code blocks when question changes
  useEffect(() => {
    if (question && question.description) {
      setProcessedDescription(processCodeBlocks(question.description));
    }
  }, [question]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-slate-50 to-white">
      {/* Question Tabs */}
      <div className="flex items-center justify-between border-b bg-white">
        <div>
          {questions.map((q, idx) => (
          <button
            key={q.id || idx}
            onClick={() => setActiveQuestionIdx(idx)}
            className={`px-4 py-2 font-semibold ${activeQuestionIdx === idx ? 'border-b-2 border-indigo-600 text-indigo-600 bg-white' : 'text-gray-600 hover:bg-gray-100'}`}
          >
            Q{idx + 1}
          </button>
        ))}
        </div>
        <div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-0.5 mr-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all duration-200 hover:scale-110"
              title="Hide instructions"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50 via-white to-purple-50 border-b border-gray-200/50 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
            <InformationCircleIcon className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              {question.title}
            </h2>
            <p className="text-xs text-gray-500">Read carefully before coding</p>
          </div>
        </div>        <div className="flex items-center space-x-2 text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-full border border-gray-200">
            <AcademicCapIcon className="w-4 h-4 text-blue-500" />
            <span className="font-medium">
              {Array.isArray(question.testCases) 
                ? question.testCases?.reduce((sum, tc) => sum + (tc.points || 0), 0) 
                : (
                    (question.testCases?.server?.reduce((sum, tc) => sum + (tc.points || 0), 0) || 0) +
                    (question.testCases?.client?.reduce((sum, tc) => sum + (tc.points || 0), 0) || 0)
                  )
              } points
            </span>
        </div>
      </div>

      {/* Tabs */}
      <QuestionTabs 
        activeTab={activeTab} 
        setActiveTab={setActiveTab} 
        question={question} 
      />

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'description' && (
          <div className="p-6 fade-in-up space-y-4">
            <div 
              className="prose prose-sm max-w-none leading-relaxed text-[15px]"
              dangerouslySetInnerHTML={{ __html: processedDescription || question.description }}
            />
            {/* Render separate image if question.image is present */}
            {question.image && (
              <img
                src={question.image.startsWith('http') ? question.image : `http://localhost:5001${question.image}`}
                alt="Question Illustration"
                className="mt-4 rounded-lg border border-gray-200 shadow-sm max-w-full"
                style={{ maxHeight: 320 }}
              />
            )}
          </div>
        )}
        {activeTab === 'precode' && (
          <div className="p-6 fade-in-up space-y-4">
            {/* Show precode and clientPrecode if available */}
            {question.precode && Object.keys(question.precode).map((fname) => (
              <div key={fname}>
                <div className="font-mono text-xs text-gray-500 mb-1">Starter code: <b>{fname}</b></div>
                <pre className="bg-gray-100 border border-gray-200 rounded-lg p-3 text-xs overflow-x-auto mb-4">
                  {question.precode[fname]}
                </pre>
              </div>
            ))}
            {question.clientPrecode && Object.keys(question.clientPrecode).map((fname) => (
              <div key={fname}>
                <div className="font-mono text-xs text-gray-500 mb-1">Client starter code: <b>{fname}</b></div>
                <pre className="bg-gray-100 border border-gray-200 rounded-lg p-3 text-xs overflow-x-auto mb-4">
                  {question.clientPrecode[fname]}
                </pre>
              </div>
            ))}
          </div>
        )}          
        {activeTab === 'testcases' && (
          <div className="fade-in-up">
            {console.log('QuestionPane passing to TestSelector:', { 
              question, 
              questionTestCases: question?.testCases,
              testCaseResults 
            })}
            <TestSelector 
              question={question}
              testCaseResults={testCaseResults}
            />
          </div>
        )}
        {activeTab === 'submissions' && (
          <div>
            <Submissions userId= { 'testuser123' } questionId= { question.id } /> 
          </div>
        )}
      </div>
    </div>
  );
}