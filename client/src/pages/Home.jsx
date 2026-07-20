import { Link } from 'react-router-dom';
import { AcademicCapIcon, BeakerIcon, UserIcon } from '@heroicons/react/24/outline';

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white border border-gray-200 rounded-xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl bg-indigo-600 flex items-center justify-center">
            <BeakerIcon className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">CN Lab</h1>
            <p className="text-sm text-gray-500">Lab evaluation workspace</p>
          </div>
        </div>

        <p className="text-sm text-gray-600 mb-6">
          Choose how you want to continue.
        </p>

        <div className="space-y-3">
          <Link
            to="/login"
            className="flex items-center justify-between w-full rounded-lg bg-indigo-600 px-4 py-3 text-white font-semibold hover:bg-indigo-700"
          >
            <span className="flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              Student Login
            </span>
            <span>→</span>
          </Link>

          <Link
            to="/teacher-login"
            className="flex items-center justify-between w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-800 font-semibold hover:bg-gray-50"
          >
            <span className="flex items-center gap-2">
              <AcademicCapIcon className="h-5 w-5" />
              Teacher Login
            </span>
            <span>→</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
