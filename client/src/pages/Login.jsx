import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { API_BASE } from '../config';

export default function Login() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetApproved, setResetApproved] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    const trimmedId = studentId.trim();

    if (!trimmedId || !password) {
      setError('Please enter your student ID and password.');
      return;
    }

    setLoading(true);
    try {
      const loginRes = await axios.post(`${API_BASE}/api/auth/student-login`, {
        userId: trimmedId,
        password,
      });
      const student = loginRes.data.student;

      const res = await axios.post(`${API_BASE}/api/sessions/init`, {
        userId: student.user_id,
        studentName: student.name,
      });

      localStorage.setItem('studentId', student.user_id);
      localStorage.setItem('studentName', student.name);
      localStorage.setItem('studentBatch', student.batch || '');
      localStorage.setItem('labSessionId', res.data.sessionId);
      localStorage.setItem('isLoggedIn', 'true');
      if (student.mustChangePassword) {
        localStorage.setItem('pendingCurrentPassword', password);
      } else {
        localStorage.removeItem('pendingCurrentPassword');
      }

      if (student.mustChangePassword) {
        navigate('/student-dashboard?changePassword=1');
      } else {
        navigate('/student-dashboard');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to login. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const requestPasswordReset = async () => {
    setError('');
    if (!studentId.trim()) {
      setError('Enter your student ID first.');
      return;
    }
    try {
      await axios.post(`${API_BASE}/api/auth/password-reset-request`, { userId: studentId.trim() });
      setError('Password reset request sent to teacher.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send reset request.');
    }
  };

  const checkResetApproval = async () => {
    setError('');
    if (!studentId.trim()) {
      setError('Enter your student ID first.');
      return;
    }
    try {
      const res = await axios.get(`${API_BASE}/api/auth/password-reset-request/${studentId.trim()}`);
      setResetApproved(res.data.request || null);
      if (!res.data.approved) setError('No approved password reset yet.');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not check reset status.');
    }
  };

  const setApprovedPassword = async () => {
    setError('');
    if (!resetApproved || !newPassword) return;
    try {
      await axios.post(`${API_BASE}/api/auth/change-password`, {
        userId: resetApproved.userId,
        resetRequestId: resetApproved._id,
        newPassword,
      });
      setError('Password changed. You can login now.');
      setResetApproved(null);
      setNewPassword('');
      setPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not change password.');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">CN Lab Login</h1>
        <p className="text-sm text-gray-500 mb-6">
          Sign in with the credentials assigned by your teacher.
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
            <p className="text-xs text-gray-400 mt-1">Optional. Your database profile name will be used after login.</p>
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

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
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

        <div className="mt-5 border-t pt-4 space-y-3">
          <div className="flex gap-2">
            <button onClick={requestPasswordReset} className="flex-1 text-sm px-3 py-2 rounded-md bg-gray-100 text-gray-700">
              Forgot password
            </button>
            <button onClick={checkResetApproval} className="flex-1 text-sm px-3 py-2 rounded-md bg-gray-100 text-gray-700">
              Check approval
            </button>
          </div>
          {resetApproved && (
            <div className="space-y-2">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <button onClick={setApprovedPassword} className="w-full py-2 rounded-md bg-green-600 text-white text-sm font-medium">
                Set New Password
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          <Link to="/" className="text-indigo-600 hover:underline">Back to home</Link>
          {' · '}
          <Link to="/teacher-upload" className="text-indigo-600 hover:underline">Teacher portal</Link>
        </p>
      </div>
    </div>
  );
}
