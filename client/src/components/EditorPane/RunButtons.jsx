import { 
  PlayIcon, 
  PaperAirplaneIcon,
  ClockIcon,
  CheckCircleIcon,
  CodeBracketIcon,
  CpuChipIcon,
  CommandLineIcon
} from '@heroicons/react/24/outline';

export default function RunButtons({ 
  onRun, 
  onSubmit, 
  isRunning, 
  isSubmitting, 
  activeFile, 
  showTerminal,
  setShowTerminal
}) {
  return (
    <div className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 via-white to-gray-50 border-t border-gray-200/50">
      <div className="flex items-center space-x-3 text-sm">
        <div className="flex items-center space-x-2 text-gray-600 bg-gray-100 px-3 py-1.5 rounded-lg border border-gray-200">
          <CodeBracketIcon className="w-4 h-4 text-indigo-500" />
          <span className="font-medium">{activeFile?.name || 'No file'}</span>
        </div>
        {activeFile && (
          <>
            <div className="w-px h-4 bg-gray-300"></div>
            <span className="capitalize text-gray-600 font-medium">{activeFile.language}</span>
            <div className="w-px h-4 bg-gray-300"></div>
            <span className="text-gray-500">{activeFile.code?.split('\n').length || 0} lines</span>
          </>
        )}
      </div>

      <div className="flex items-center space-x-3">
        {/* Run button */}
        <button
          onClick={onRun}
          disabled={isRunning || isSubmitting || !activeFile}
          className={`
            flex items-center space-x-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 shadow-lg
            ${isRunning
              ? 'bg-gradient-to-r from-gray-400 to-gray-500 text-white cursor-not-allowed'
              : !activeFile
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-emerald-500 to-green-600 text-white hover:from-emerald-600 hover:to-green-700 hover:shadow-xl hover:scale-105 active:scale-95'
            }
          `}
          title={!activeFile ? 'No file to run' : 'Run code (Ctrl+Enter)'}
        >
          {isRunning ? (
            <>
              <CpuChipIcon className="w-4 h-4 animate-spin" />
              <span>Running...</span>
            </>
          ) : (
            <>
              <PlayIcon className="w-4 h-4" />
              <span>Run Code</span>
            </>
          )}
        </button>

        {/* Submit button */}
        <button
          onClick={onSubmit}
          disabled={isRunning || isSubmitting || !activeFile}
          className={`
            flex items-center space-x-2 px-6 py-2.5 rounded-xl font-semibold text-sm transition-all duration-300 shadow-lg
            ${isSubmitting
              ? 'bg-gradient-to-r from-gray-400 to-gray-500 text-white cursor-not-allowed'
              : !activeFile
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white hover:from-indigo-600 hover:to-purple-700 hover:shadow-xl hover:scale-105 active:scale-95'
            }
          `}
          title={!activeFile ? 'No file to submit' : 'Submit solution'}
        >
          {isSubmitting ? (
            <>
              <ClockIcon className="w-4 h-4 animate-spin" />
              <span>Submitting...</span>
            </>
          ) : (
            <>
              <PaperAirplaneIcon className="w-4 h-4" />
              <span>Submit</span>
            </>
          )}
        </button>

        {/* Show Terminal button */}
        {setShowTerminal && (
          <button
            onClick={() => setShowTerminal(v => !v)}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-semibold text-sm transition-all duration-300 shadow-lg
              ${showTerminal
                ? 'bg-gradient-to-r from-gray-800 to-gray-900 text-green-300 hover:from-gray-700 hover:to-gray-800'
                : 'bg-gradient-to-r from-gray-200 to-gray-300 text-gray-700 hover:from-gray-300 hover:to-gray-400'}
            `}
            title={showTerminal ? 'Hide Terminal' : 'Show Terminal'}
          >
            <CommandLineIcon className="w-5 h-5" />
            <span className="hidden sm:inline">{showTerminal ? 'Hide Terminal' : 'Show Terminal'}</span>
          </button>
        )}
      </div>
    </div>
  );
}