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
  const [disconnectRequests, setDisconnectRequests] = useState([]);
  const [form, setForm] = useState({ name: '', defaultPassword: '', studentIds: '' });
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [studentDraft, setStudentDraft] = useState({ name: '', batch: '', password: '' });
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordPlaceholder = form.name.trim()
    ? `${form.name.trim().toLowerCase()}batch`
    : 'nbatch';

  useEffect(() => {
    axios.get(`${API_BASE}/api/auth/me`, { params: { role: 'teacher' } })
      .then((res) => {
        if (!['faculty', 'admin'].includes(res.data.user.role)) navigate('/teacher-login');
      })
      .catch(() => navigate('/teacher-login'));
  }, [navigate]);

  const handleLogout = async () => {
    await axios.post(`${API_BASE}/api/auth/logout`, { role: 'teacher' }).catch(() => {});
    navigate('/teacher-login');
  };

  const loadData = async () => {
    const [batchRes, studentRes, requestRes, disconnectRequestRes] = await Promise.all([
      axios.get(`${API_BASE}/api/batches`),
      axios.get(`${API_BASE}/api/batches/students`),
      axios.get(`${API_BASE}/api/batches/password-reset-requests`),
      axios.get(`${API_BASE}/api/batches/session-disconnect-requests`),
    ]);
    setBatches(batchRes.data || []);
    setStudents(studentRes.data || []);
    setRequests(requestRes.data || []);
    setDisconnectRequests(disconnectRequestRes.data || []);
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

  const updateDisconnectRequest = async (id, status) => {
    try {
      await axios.patch(`${API_BASE}/api/batches/session-disconnect-requests/${id}`, { status });
      setMessage(status === 'approved' ? 'Student sessions disconnected.' : 'Disconnect request rejected.');
      await loadData();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Could not update disconnect request.');
    }
  };

  const startEditStudent = (student) => {
    setEditingStudentId(student.user_id);
    setStudentDraft({
      name: student.name || '',
      batch: student.batch || '',
      password: '',
    });
  };

  const saveStudent = async (userId) => {
    try {
      await axios.patch(`${API_BASE}/api/batches/students/${userId}`, {
        name: studentDraft.name,
        batch: studentDraft.batch,
        password: studentDraft.password || undefined,
        mustChangePassword: studentDraft.password ? true : undefined,
      });
      setEditingStudentId(null);
      setStudentDraft({ name: '', batch: '', password: '' });
      setMessage('Student updated.');
      await loadData();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to update student.');
    }
  };

  const deleteStudent = async (userId) => {
    if (!confirm(`Delete student ${userId}? This removes the student login account.`)) return;
    try {
      await axios.delete(`${API_BASE}/api/batches/students/${userId}`);
      setMessage('Student deleted.');
      await loadData();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to delete student.');
    }
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
                placeholder={passwordPlaceholder}
                className="w-full border rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Student IDs</label>
              <textarea
                value={form.studentIds}
                onChange={(e) => setForm({ ...form, studentIds: e.target.value })}
                placeholder={'2023103067, mani\n2023103501, jeffin'}
                className="w-full border rounded-md px-3 py-2 text-sm h-36"
              />
            </div>
            <button disabled={loading} className="w-full bg-indigo-600 text-white rounded-md py-2 text-sm font-medium disabled:opacity-50">
              {loading ? 'Saving...' : 'Save Batch'}
            </button>
            {message && <p className="text-sm text-gray-700">{message}</p>}
          </form>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-amber-200 rounded-lg p-5 shadow-sm">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Session Disconnect Requests</h2>
              <p className="text-xs text-gray-500 mb-3">Approve only after confirming the student needs their previous login ended.</p>
              {disconnectRequests.length === 0 ? (
                <p className="text-sm text-gray-500">No pending requests.</p>
              ) : (
                <div className="divide-y">
                  {disconnectRequests.map((r) => (
                    <div key={r._id} className="py-3 flex items-center justify-between gap-3">
                      <div className="text-sm"><p className="font-medium text-gray-900">{r.studentName || r.userId}</p><p className="text-gray-500">{r.userId} · Batch {r.batch || '-'}</p></div>
                      <div className="flex gap-2"><button onClick={() => updateDisconnectRequest(r._id, 'approved')} className="px-3 py-1.5 rounded-md bg-amber-600 text-white text-sm">Disconnect</button><button onClick={() => updateDisconnectRequest(r._id, 'rejected')} className="px-3 py-1.5 rounded-md bg-gray-200 text-gray-700 text-sm">Reject</button></div>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
                      <th className="text-left px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {students.map((s) => (
                      <tr key={s.user_id}>
                        <td className="px-3 py-2">{s.user_id}</td>
                        {editingStudentId === s.user_id ? (
                          <>
                            <td className="px-3 py-2">
                              <input
                                value={studentDraft.name}
                                onChange={(e) => setStudentDraft({ ...studentDraft, name: e.target.value })}
                                className="w-full border rounded-md px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                value={studentDraft.batch}
                                onChange={(e) => setStudentDraft({ ...studentDraft, batch: e.target.value })}
                                className="w-20 border rounded-md px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="password"
                                value={studentDraft.password}
                                onChange={(e) => setStudentDraft({ ...studentDraft, password: e.target.value })}
                                placeholder="New password"
                                className="w-36 border rounded-md px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <button onClick={() => saveStudent(s.user_id)} className="text-green-700 font-medium mr-3">Save</button>
                              <button onClick={() => setEditingStudentId(null)} className="text-gray-600">Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2">{s.name}</td>
                            <td className="px-3 py-2">{s.batch || '-'}</td>
                            <td className="px-3 py-2">{s.mustChangePassword ? 'Default' : 'Changed'}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              <button onClick={() => startEditStudent(s)} className="text-indigo-700 font-medium mr-3">Edit</button>
                              <button onClick={() => deleteStudent(s.user_id)} className="text-red-700 font-medium">Delete</button>
                            </td>
                          </>
                        )}
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
