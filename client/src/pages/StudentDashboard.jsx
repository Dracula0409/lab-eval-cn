import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import { API_BASE } from '../config';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState(null);
  const [message, setMessage] = useState('');
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: localStorage.getItem('pendingCurrentPassword') || '',
    newPassword: '',
  });

  const userId = localStorage.getItem('studentId');

  useEffect(() => {
    if (localStorage.getItem('isLoggedIn') !== 'true' || !userId) {
      navigate('/login');
      return;
    }

    axios.get(`${API_BASE}/api/sessions/student-dashboard/${userId}`)
      .then((res) => setDashboard(res.data))
      .catch(() => setMessage('Failed to load dashboard.'));
  }, [navigate, userId]);

  const logout = () => {
    localStorage.removeItem('studentId');
    localStorage.removeItem('studentName');
    localStorage.removeItem('studentBatch');
    localStorage.removeItem('labSessionId');
    localStorage.removeItem('isLoggedIn');
    navigate('/login');
  };

  const enterLab = async () => {
    try {
      const res = await axios.post(`${API_BASE}/api/sessions/init`, {
        userId,
        studentName: dashboard?.student?.name || localStorage.getItem('studentName'),
      });
      localStorage.setItem('labSessionId', res.data.sessionId);
      navigate('/workspace');
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to start lab workspace.');
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      await axios.post(`${API_BASE}/api/auth/change-password`, {
        userId,
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
      });
      setPasswordForm({ currentPassword: '', newPassword: '' });
      localStorage.removeItem('pendingCurrentPassword');
      setMessage('Password changed.');
      const res = await axios.get(`${API_BASE}/api/sessions/student-dashboard/${userId}`);
      setDashboard(res.data);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to change password.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Student Dashboard" onLogout={logout} />
      <div className="container mx-auto py-8 px-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {message && <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800">{message}</div>}

          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm flex items-center justify-between">
            <div>
              <h1 className="text-lg font-semibold text-gray-900">{dashboard?.student?.name || 'Student'}</h1>
              <p className="text-sm text-gray-500">
                {dashboard?.student?.user_id} · Batch {dashboard?.student?.batch || '-'}
              </p>
            </div>
            <button onClick={logout} className="px-4 py-2 rounded-md bg-gray-100 text-gray-700 text-sm font-medium">Logout</button>
          </div>

          {dashboard?.student?.mustChangePassword && (
            <form onSubmit={changePassword} className="bg-white border border-orange-200 rounded-lg p-5 shadow-sm space-y-3">
              <h2 className="text-base font-semibold text-gray-900">Change Default Password</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="password"
                  value={passwordForm.currentPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                  placeholder="Current password"
                  className="border rounded-md px-3 py-2 text-sm"
                />
                <input
                  type="password"
                  value={passwordForm.newPassword}
                  onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                  placeholder="New password"
                  className="border rounded-md px-3 py-2 text-sm"
                />
              </div>
              <button className="px-4 py-2 rounded-md bg-orange-600 text-white text-sm font-medium">Update Password</button>
            </form>
          )}

          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Active Lab Sessions</h2>
            {dashboard?.activeSessions?.length ? (
              dashboard.activeSessions.map((s) => (
                <div key={s.module._id} className="border rounded-md p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{s.module.name}</p>
                    <p className="text-sm text-gray-500">{s.slotKey} · Ends {new Date(s.endsAt).toLocaleString()}</p>
                  </div>
                  <button onClick={enterLab} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium">Enter Lab</button>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">No active lab session is assigned to your batch right now.</p>
            )}
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Previous Tests</h2>
            {dashboard?.previousTests?.length ? (
              <div className="divide-y">
                {dashboard.previousTests.map((t) => (
                  <div key={`${t.sessionId}-${t.moduleId}`} className="py-3 text-sm">
                    <p className="font-medium text-gray-900">{t.moduleName}</p>
                    <p className="text-gray-500">{t.slotKey || t.sessionId} · {t.questionCount} submitted question(s)</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">No submitted lab sessions yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
