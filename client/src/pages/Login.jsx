import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE } from '../config';

export default function Login() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const trimmedId = studentId.trim();

    if (!trimmedName || !trimmedId) {
      setError('Please enter both your name and roll number / ID.');
      return;
    }

    setLoading(true);
    try {
      const res = await axios.post(`${API_BASE}/api/sessions/init`, {
        userId: trimmedId,
        studentName: trimmedName,
      });

      localStorage.setItem('studentId', trimmedId);
      localStorage.setItem('studentName', trimmedName);
      localStorage.setItem('labSessionId', res.data.sessionId);
      localStorage.setItem('isLoggedIn', 'true');

      navigate('/workspace');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start lab session. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">CN Lab Login</h1>
        <p className="text-sm text-gray-500 mb-6">
          Enter your details to start the lab session. Your container will be created automatically.
        </p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. John Doe"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Roll Number / Student ID</label>
            <input
              type="text"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="e.g. 2023103067"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">Used in evaluation CSVs and grading export.</p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            {loading ? 'Starting session…' : 'Enter Lab'}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          <Link to="/" className="text-indigo-600 hover:underline">Back to home</Link>
          {' · '}
          <Link to="/teacher-upload" className="text-indigo-600 hover:underline">Teacher portal</Link>
        </p>
      </div>
    </div>
  );
}
