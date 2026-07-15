import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import { API_BASE } from '../config';
import {
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  UserIcon,
} from '@heroicons/react/24/outline';

const CONN_LABELS = ['Listen', 'Established', 'Closed'];

function VerdictPill({ value }) {
  if (!value) return <span className="text-gray-300">—</span>;
  const isCorrect = value === 'Correct';
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
        isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
      }`}
    >
      {value}
    </span>
  );
}

export default function TeacherPerformance() {
  const navigate = useNavigate();

  const [batches, setBatches] = useState([]);
  const [slots, setSlots] = useState([]);
  const [modules, setModules] = useState([]);

  const [selectedBatch, setSelectedBatch] = useState('');
  const [selectedSlot, setSelectedSlot] = useState('');
  const [selectedModuleId, setSelectedModuleId] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [studentReport, setStudentReport] = useState(null);
  const [classReport, setClassReport] = useState(null);
  const [isClassLoading, setIsClassLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [message, setMessage] = useState('');

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

  const loadFilters = useCallback(async () => {
    try {
      const [batchesRes, slotsRes, modulesRes] = await Promise.all([
        axios.get(`${API_BASE}/api/performance/batches`),
        axios.get(`${API_BASE}/api/performance/slots`),
        axios.get(`${API_BASE}/api/modules`),
      ]);
      setBatches(batchesRes.data || []);
      setSlots(slotsRes.data || []);
      setModules(modulesRes.data || []);
    } catch (err) {
      console.error('Error loading performance filters:', err);
      setMessage('Failed to load batches/slots/modules.');
    }
  }, []);

  useEffect(() => {
    loadFilters();
  }, [loadFilters]);

  useEffect(() => {
    if (!selectedBatch || !selectedModuleId || !selectedSlot) {
      setClassReport(null);
      return;
    }

    let cancelled = false;
    setIsClassLoading(true);
    setMessage('');
    axios.get(`${API_BASE}/api/performance/class-report`, {
      params: {
        batch: selectedBatch,
        moduleId: selectedModuleId,
        slot: selectedSlot,
      },
    })
      .then((res) => {
        if (!cancelled) setClassReport(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          setClassReport(null);
          setMessage(err.response?.data?.error || 'Failed to load class report.');
        }
      })
      .finally(() => {
        if (!cancelled) setIsClassLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedBatch, selectedModuleId, selectedSlot]);

  const handleSearch = async (e) => {
    e?.preventDefault();
    if (!searchTerm.trim()) return;

    setIsSearching(true);
    setSearchError('');
    setStudentReport(null);

    try {
      const params = {};
      if (selectedSlot) params.slot = selectedSlot;
      if (selectedModuleId) params.moduleId = selectedModuleId;

      const res = await axios.get(
        `${API_BASE}/api/performance/student/${encodeURIComponent(searchTerm.trim())}`,
        { params }
      );
      setStudentReport(res.data);
    } catch (err) {
      setSearchError(err.response?.data?.error || 'Student not found.');
    } finally {
      setIsSearching(false);
    }
  };

  const handleDownloadCsv = async () => {
    if (!selectedBatch) {
      setMessage('Please select a class/batch first.');
      return;
    }
    if (!selectedModuleId) {
      setMessage('Please select a module first.');
      return;
    }

    setIsDownloading(true);
    setMessage('');

    try {
      const res = await axios.get(`${API_BASE}/api/performance/class-csv`, {
        params: { batch: selectedBatch, moduleId: selectedModuleId, slot: selectedSlot || undefined },
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      const slotPart = selectedSlot || 'all-slots';
      link.setAttribute('download', `performance_${selectedBatch}_${slotPart}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading CSV:', err);
      setMessage(
        err.response?.data?.error
          ? err.response.data.error
          : 'Failed to download the class report.'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        title="Student Performances"
        isTeacherPage={true}
        backLink="/teacher-dashboard"
        backText="Back to Dashboard"
        onLogout={handleLogout}
      />

      <div className="container mx-auto py-8 px-4">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Filters */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Session &amp; Class</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Session (slot)
                </label>
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">All sessions</option>
                  {slots.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Class / Batch
                </label>
                <select
                  value={selectedBatch}
                  onChange={(e) => setSelectedBatch(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select batch</option>
                  {batches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Module</label>
                <select
                  value={selectedModuleId}
                  onChange={(e) => setSelectedModuleId(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Select module</option>
                  {modules.map((m) => (
                    <option key={m._id} value={m._id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {message && (
            <div className="p-3 rounded-md bg-yellow-50 text-yellow-800 border-l-4 border-yellow-400 text-sm">
              {message}
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Class Report</h2>
            {!selectedBatch || !selectedModuleId || !selectedSlot ? (
              <p className="text-sm text-gray-500">Select session, batch, and module to show all student reports.</p>
            ) : isClassLoading ? (
              <p className="text-sm text-gray-500">Loading class report...</p>
            ) : classReport?.rows?.length ? (
              <div className="overflow-x-auto border rounded-md">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2">Student</th>
                      {classReport.rows[0]?.questions?.map((q) => (
                        <th key={q.questionId} className="text-left px-3 py-2">
                          {q.questionKey || q.title || 'Question'}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {classReport.rows.map((row) => (
                      <tr key={row.student.user_id}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-gray-900">{row.student.roll_number || row.student.user_id}</p>
                          <p className="text-xs text-gray-500">{row.student.name}</p>
                        </td>
                        {row.questions.map((q) => (
                          <td key={q.questionId} className="px-3 py-2 align-top">
                            {q.attempted ? (
                              <div className="space-y-1">
                                <div className="flex flex-wrap gap-1">
                                  {q.tcVerdicts.map((value, index) => (
                                    <span key={index} className="text-xs">
                                      TC{index + 1}: <VerdictPill value={value} />
                                    </span>
                                  ))}
                                </div>
                                <p className="text-xs text-gray-500">Persistence: {q.persistence || '-'}</p>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">Not attempted</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500">No students found for this selection.</p>
            )}
          </div>

          {/* Option I: Individual lookup */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-indigo-500" />
              Individual Student Report
            </h2>

            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by roll number or student ID (e.g. 2023103067)"
                className="flex-1 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                <MagnifyingGlassIcon className="w-4 h-4" />
                {isSearching ? 'Searching…' : 'Search'}
              </button>
            </form>

            {searchError && (
              <div className="p-3 rounded-md bg-red-50 text-red-700 border-l-4 border-red-400 text-sm mb-4">
                {searchError}
              </div>
            )}

            {studentReport && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-600 bg-gray-50 rounded-md px-4 py-3">
                  <span>
                    <span className="font-medium text-gray-900">
                      {studentReport.student.name}
                    </span>{' '}
                    ({studentReport.student.roll_number || studentReport.student.user_id})
                  </span>
                  {studentReport.student.batch && (
                    <span>
                      Batch: <span className="font-medium">{studentReport.student.batch}</span>
                    </span>
                  )}
                  {studentReport.slot && (
                    <span>
                      Session: <span className="font-medium">{studentReport.slot}</span>
                    </span>
                  )}
                </div>

                {studentReport.questions.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">
                    No evaluation runs found for this student in the selected scope.
                  </p>
                ) : (
                  studentReport.questions.map((q) => (
                    <div key={q.questionId} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-2 flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-800">
                          {q.questionKey || q.title || 'Question'}
                        </span>
                        {!q.attempted && (
                          <span className="text-xs text-gray-400">Not attempted</span>
                        )}
                      </div>
                      {q.attempted && (
                        <div className="p-4 overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-gray-500 uppercase">
                                {q.tcVerdicts.map((_, i) => (
                                  <th key={i} className="pr-4 pb-1">
                                    TC{i + 1}
                                  </th>
                                ))}
                                <th className="pr-4 pb-1">Persistence</th>
                                {CONN_LABELS.map((label) => (
                                  <th key={label} className="pr-4 pb-1">
                                    {label}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                {q.tcVerdicts.map((v, i) => (
                                  <td key={i} className="pr-4 py-1">
                                    <VerdictPill value={v} />
                                  </td>
                                ))}
                                <td className="pr-4 py-1 text-gray-700">
                                  {q.persistence || '—'}
                                </td>
                                {CONN_LABELS.map((label) => (
                                  <td key={label} className="pr-4 py-1">
                                    <VerdictPill value={q[label]} />
                                  </td>
                                ))}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Option II: Collective CSV download */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-2">
              Collective Class Report
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Downloads one CSV row per student in the selected batch, with each
              question's test-case verdicts, persistence, and connection checks
              laid out as columns — matching the per-student evaluated/status/conn
              CSVs produced during evaluation.
            </p>
            <button
              onClick={handleDownloadCsv}
              disabled={isDownloading}
              className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-md text-sm font-medium hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 flex items-center gap-2"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
              {isDownloading ? 'Preparing CSV…' : 'Download Class CSV'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
