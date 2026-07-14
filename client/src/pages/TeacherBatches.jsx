import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import { API_BASE } from '../config';

export default function TeacherBatches() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]);
  const [students, setStudents] = useState([]);
  const [requests, setRequests] = useState([]);
  const [form, setForm] = useState({ name: '', defaultPassword: '', studentIds: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('isTeacherLoggedIn') !== 'true') navigate('/teacher-login');
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('isTeacherLoggedIn');
    navigate('/teacher-login');
  };

  const loadData = async () => {
    const [batchRes, studentRes, requestRes] = await Promise.all([
      axios.get(`${API_BASE}/api/batches`),
      axios.get(`${API_BASE}/api/batches/students`),
      axios.get(`${API_BASE}/api/batches/password-reset-requests`),
    ]);
    setBatches(batchRes.data || []);
    setStudents(studentRes.data || []);
    setRequests(requestRes.data || []);
  };

  useEffect(() => {
    loadData().catch(() => setMessage('Failed to load batch data.'));
  }, []);

  const createBatch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    try {
      await axios.post(`${API_BASE}/api/batches`, form);
      setMessage('Batch saved and student accounts created.');
      setForm({ name: '', defaultPassword: '', studentIds: '' });
      await loadData();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to save batch.');
    } finally {
      setLoading(false);
    }
  };

  const updateRequest = async (id, status) => {
    await axios.patch(`${API_BASE}/api/batches/password-reset-requests/${id}`, { status });
    await loadData();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Batches & Students"
        isTeacherPage={true}
        backLink="/teacher-dashboard"
        backText="Back to Dashboard"
        onLogout={handleLogout}
      />

      <div className="container mx-auto py-8 px-4">
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={createBatch} className="lg:col-span-1 bg-white border border-gray-200 rounded-lg p-5 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-gray-900">Create / Update Batch</h2>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Batch</label>
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="N, P, Q"
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Default Password</label>
              <input
                type="password"
                value={form.defaultPassword}
                onChange={(e) => setForm({ ...form, defaultPassword: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Student IDs</label>
              <textarea
                value={form.studentIds}
                onChange={(e) => setForm({ ...form, studentIds: e.target.value })}
                placeholder="One per line, or comma separated"
                className="w-full border rounded-md px-3 py-2 text-sm h-36"
              />
            </div>
            <button disabled={loading} className="w-full bg-indigo-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Batch'}
            </button>
            {message && <p className="text-sm text-gray-700">{message}</p>}
          </form>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Password Reset Requests</h2>
              {requests.length === 0 ? (
                <p className="text-sm text-gray-500">No pending requests.</p>
              ) : (
                <div className="divide-y">
                  {requests.map((r) => (
                    <div key={r._id} className="py-3 flex items-center justify-between gap-3">
                      <div className="text-sm">
                        <p className="font-medium text-gray-900">{r.studentName || r.userId}</p>
                        <p className="text-gray-500">{r.userId} · Batch {r.batch || '-'}</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => updateRequest(r._id, 'approved')} className="px-3 py-1.5 rounded-md bg-green-600 text-white text-sm">Approve</button>
                        <button onClick={() => updateRequest(r._id, 'rejected')} className="px-3 py-1.5 rounded-md bg-gray-200 text-gray-700 text-sm">Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-3">Batches</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                {batches.map((b) => (
                  <div key={b._id} className="border rounded-md p-3">
                    <p className="font-semibold text-gray-900">{b.name}</p>
                    <p className="text-sm text-gray-500">{b.studentIds?.length || 0} students</p>
                  </div>
                ))}
              </div>

              <h3 className="text-sm font-semibold text-gray-700 mb-2">Students</h3>
              <div className="overflow-x-auto border rounded-md">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2">Student ID</th>
                      <th className="text-left px-3 py-2">Name</th>
                      <th className="text-left px-3 py-2">Batch</th>
                      <th className="text-left px-3 py-2">Password</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {students.map((s) => (
                      <tr key={s.user_id}>
                        <td className="px-3 py-2">{s.user_id}</td>
                        <td className="px-3 py-2">{s.name}</td>
                        <td className="px-3 py-2">{s.batch || '-'}</td>
                        <td className="px-3 py-2">{s.mustChangePassword ? 'Default' : 'Changed'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
