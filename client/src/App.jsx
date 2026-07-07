import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import CNLabWorkspace from './pages/CNLabWorkspace';
import TeacherUpload from './pages/TeacherUpload';
import Home from './pages/Home';
import Login from './pages/Login';
import './App.css';

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="relative z-10">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/workspace" element={<CNLabWorkspace />} />
            <Route path="/teacher-upload" element={<TeacherUpload />} />
          </Routes>
        </div>
      </div>
    </Router>
  );
}

export default App;