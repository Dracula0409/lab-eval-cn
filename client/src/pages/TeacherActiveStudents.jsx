import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import { API_BASE } from '../config';

export default function TeacherActiveStudents() {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const result = await axios.get(`${API_BASE}/api/auth/active-students`, { params: { role: 'teacher' } });
      setStudents(result.data.students);
      setMessage('');
    } catch (error) {
      if ([401, 403].includes(error.response?.status)) navigate('/teacher-login');
      else setMessage(error.response?.data?.error || 'Unable to load active students.');
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const disconnect = async (student) => {
    if (!window.confirm(`Disconnect ${student.userId}? They will be returned to the login page on their next request.`)) return;
    try {
      await axios.post(`${API_BASE}/api/auth/active-students/${student.connectionId}/disconnect`, {}, { params: { role: 'teacher' } });
      await load();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Could not disconnect this student.');
    }
  };

  const logout = async () => {
    await axios.post(`${API_BASE}/api/auth/logout`, { role: 'teacher' }).catch(() => {});
    navigate('/teacher-login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header title="Active Students" isTeacherPage backLink="/teacher-dashboard" backText="Dashboard" onLogout={logout} />
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex flex-wrap gap-3 items-center justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Live student connections</h1>
            <p className="text-sm text-gray-500">Updates every 15 seconds. A student is considered offline after 15 minutes without a heartbeat.</p>
          </div>
          <button onClick={load} className="px-4 py-2 rounded-md bg-indigo-600 text-white text-sm font-medium">Refresh</button>
        </div>
        {message && <p className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>}
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600"><tr><th className="p-3">Student</th><th className="p-3">IP address</th><th className="p-3">Connected</th><th className="p-3">Last seen</th><th className="p-3">Browser</th><th className="p-3" /></tr></thead>
            <tbody>
              {!loading && students.length === 0 && <tr><td colSpan="6" className="p-6 text-center text-gray-500">No active student connections.</td></tr>}
              {students.map((student) => <tr key={student.connectionId} className="border-t border-gray-100">
                <td className="p-3 font-medium text-gray-900"><div>{student.name}</div><div className="font-normal text-xs text-gray-500">{student.userId}{student.batch ? ` · ${student.batch}` : ''}</div></td><td className="p-3 font-mono text-xs">{student.ipAddress}</td><td className="p-3">{new Date(student.connectedAt).toLocaleString()}</td><td className="p-3">{new Date(student.lastSeenAt).toLocaleTimeString()}</td><td className="p-3 max-w-xs truncate text-gray-500" title={student.userAgent}>{student.userAgent || 'Unknown'}</td>
                <td className="p-3 text-right"><button onClick={() => disconnect(student)} className="rounded-md bg-red-600 px-3 py-1.5 text-white font-medium hover:bg-red-700">Disconnect</button></td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
