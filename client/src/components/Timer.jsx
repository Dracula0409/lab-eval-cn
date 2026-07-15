import { useState, useEffect } from 'react';

export default function Timer({ duration, totalDuration, onExpire }) {
  const [timeLeft, setTimeLeft] = useState(duration);

  useEffect(() => {
    setTimeLeft(duration);
  }, [duration]);

  useEffect(() => {
    if (timeLeft <= 0) {
      onExpire?.();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft, onExpire]);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const getColorClass = () => {
    if (timeLeft <= 300) return 'text-red-600 font-bold animate-pulse'; // 5 minutes
    if (timeLeft <= 900) return 'text-orange-600 font-black'; // 15 minutes
    return 'text-gray-700 font-bold';
  };

  const getProgressPercentage = () => {
    const total = totalDuration || duration || 1;
    return Math.max(0, Math.min(100, (Math.max(0, timeLeft) / total) * 100));
  };

  const getProgressColor = () => {
    if (timeLeft <= 300) return 'from-red-500 to-red-600';
    if (timeLeft <= 900) return 'from-orange-500 to-orange-600';
    return 'from-blue-500 to-indigo-600';
  };

  return (
    <div className="flex items-center space-x-3">
      <div className={`text-md font-mono ${getColorClass()} select-none`}>
        {formatTime(timeLeft)}
      </div>
      
      {/* progress indicator */}
      <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden shadow-inner">
        <div 
          className={`h-full transition-all duration-1000 ease-out bg-gradient-to-r ${getProgressColor()} relative overflow-hidden`}
          style={{ width: `${getProgressPercentage()}%` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"></div>
        </div>
      </div>
      
      {/* Time status indicator */}
      <div className={`w-3 h-3 rounded-full ${
        timeLeft <= 300 ? 'bg-red-500 animate-pulse' :
        timeLeft <= 900 ? 'bg-orange-500' : 'bg-green-500'
      }`}></div>
    </div>
  );
}
