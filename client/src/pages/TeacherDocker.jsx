import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import { CubeIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';

export default function TeacherDocker() {
  const navigate = useNavigate();

  useEffect(() => {
    if (localStorage.getItem('isTeacherLoggedIn') !== 'true') {
      navigate('/teacher-login');
    }
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('isTeacherLoggedIn');
    navigate('/teacher-login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Docker Manager"
        isTeacherPage={true}
        backLink="/teacher-dashboard"
        backText="Back to Dashboard"
        onLogout={handleLogout}
      />

      <div className="container mx-auto py-16 px-4">
        <div className="max-w-xl mx-auto text-center bg-white rounded-2xl border border-gray-200 shadow-sm p-10">
          <div className="mx-auto mb-4 p-4 rounded-full bg-gray-100 w-fit">
            <CubeIcon className="w-8 h-8 text-gray-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">Docker Manager — coming soon</h2>
          <p className="text-sm text-gray-500 mt-2">
            This panel will let you list active/stopped student containers and
            prune old or unused ones without touching the host shell.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-gray-400">
            <WrenchScrewdriverIcon className="w-4 h-4" />
            <span>Not yet implemented</span>
          </div>
        </div>
      </div>
    </div>
  );
}