import Timer from './Timer';
import { Link } from 'react-router-dom';
import { 
  QuestionMarkCircleIcon, 
  BeakerIcon,
  ClockIcon,
  EyeIcon,
  EyeSlashIcon,
  SparklesIcon,
  ArrowLeftIcon,
  AcademicCapIcon,
  InformationCircleIcon,
  ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';

export default function Header({ 
  title, 
  timeLimit, 
  totalTimeLimit,
  onTimeUp, 
  showQuestion = true, 
  onToggleQuestion,
  isTeacherPage = false,
  backLink,
  backText,
  moduleInfo,
  loadingQuestions,
  onLogout
}) {
  return (
    <header className="bg-white/80 backdrop-blur-lg border-b border-gray-200/50 shadow-lg">
      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-purple-500/5 to-cyan-500/5"></div>
      <div className="relative flex items-center justify-between px-6 py-4 max-h-16">
        {/* Left section */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 group">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg group-hover:shadow-xl transition-all duration-300">
              <BeakerIcon className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                CN Lab
              </h1>
              <div className="flex items-center space-x-1 text-xs text-gray-500">
                <SparklesIcon className="w-3 h-3" />
                <span>{isTeacherPage ? 'Teacher Dashboard' : 'Interactive Learning'}</span>
              </div>
            </div>
          </div>
          
          <div className="hidden md:flex items-center space-x-2 text-gray-500">
            <div className="w-px h-8 bg-gradient-to-b from-transparent via-gray-300 to-transparent"></div>
            {isTeacherPage ? (
              <AcademicCapIcon className="w-4 h-4 text-indigo-500" />
            ) : (
              <QuestionMarkCircleIcon className="w-4 h-4 text-indigo-500" />
            )}
            <h2 className="text-md font-medium text-gray-700 bg-gray-50 px-3 py-1 rounded-full">
              {title}
            </h2>
            
            {/* Module info pill in header */}
            {moduleInfo && (
              <div className="ml-2 flex items-center bg-indigo-50 rounded-full px-3 py-1 text-xs text-indigo-700 border border-indigo-100">
                <InformationCircleIcon className="w-4 h-4 mr-1" />
                <span className="mr-2 font-medium">{moduleInfo.time}</span>
                <span className="font-medium">{moduleInfo.maxMarks || 'N/A'} Marks</span>
              </div>
            )}
            
            {/* Loading indicator */}
            {loadingQuestions && (
              <div className="ml-2 flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-indigo-700"></div>
                <span className="ml-2 text-xs text-gray-600">Loading...</span>
              </div>
            )}
          </div>
        </div>

        {/* Center section - Mobile title with module info */}
        <div className="md:hidden flex flex-col items-center">
          <h2 className="text-lg font-semibold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent truncate max-w-xs">
            {title}
          </h2>
          {moduleInfo && (
            <div className="text-xs text-gray-500">
              {moduleInfo.time} · {moduleInfo.maxMarks || 'N/A'} Marks
            </div>
          )}
        </div>

        {/* Right section */}
        <div className="flex items-center space-x-4">
          {/* Back button for teacher pages */}
          {isTeacherPage && backLink && (
            <Link 
              to={backLink}
              className="hidden md:flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-indigo-600 bg-white/50 hover:bg-indigo-50 backdrop-blur-sm rounded-xl border border-gray-200/50 shadow-sm hover:shadow-md transition-all duration-300"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              <span className="hidden lg:inline">{backText || 'Back'}</span>
            </Link>
          )}
          {/* Logout button for teacher pages */}
          {isTeacherPage && onLogout && (
            <button
              onClick={onLogout}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-red-600 hover:text-white bg-red-50 hover:bg-red-600 backdrop-blur-sm rounded-xl border border-red-200/50 shadow-sm hover:shadow-md transition-all duration-300"
            >
              <ArrowRightOnRectangleIcon className="w-4 h-4" />
              <span className="hidden lg:inline">Logout</span>
            </button>
          )}
          
          {/* Question toggle (desktop only) */}
          {onToggleQuestion && (
            <button
              onClick={onToggleQuestion}
              className="hidden md:flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-indigo-600 bg-white/50 hover:bg-indigo-50 backdrop-blur-sm rounded-xl border border-gray-200/50 shadow-sm hover:shadow-md transition-all duration-300"
              title={showQuestion ? "Hide instructions" : "Show instructions"}
            >
              {showQuestion ? (
                <EyeSlashIcon className="w-4 h-4" />
              ) : (
                <EyeIcon className="w-4 h-4" />
              )}
              <span className="hidden lg:inline">
                {showQuestion ? 'Hide' : 'Show'} Instructions
              </span>
            </button>
          )}

          {/* Timer - Only show for student pages */}
          {!isTeacherPage && timeLimit != null && (
            <div className="flex items-center space-x-3 bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-2 rounded-xl border border-gray-200/50 shadow-sm backdrop-blur-sm">
              <div className="p-1 bg-gradient-to-br from-orange-400 to-red-500 rounded-lg">
                <ClockIcon className="w-5 h-5 text-white" />
              </div>
              <Timer duration={timeLimit} totalDuration={totalTimeLimit} onExpire={onTimeUp} />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
