import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-3xl font-bold mb-4">Welcome to CN Lab Evaluation System</h1>
      <div className="space-x-4">
        <Link to="/login" className="text-indigo-600 underline">Student Login</Link>
        <Link to="/teacher-upload" className="text-blue-600 underline">Teacher Upload</Link>
      </div>
    </div>
  );
}
