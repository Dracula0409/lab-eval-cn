import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { touchStudentConnection } from '../utils/studentConnections.js';

export const STUDENT_JWT_COOKIE_NAME = 'cnlab_student_token';
export const TEACHER_JWT_COOKIE_NAME = 'cnlab_teacher_token';
export const JWT_COOKIE_NAME = 'cnlab_token';
export const JWT_SECRET = process.env.JWT_SECRET || 'devmode-secret';

export function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const cookies = Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
  return cookies[name];
}

export function signUserToken(user, sessionId = null) {
  return jwt.sign(
    {
      id: user._id.toString(),
      user_id: user.user_id,
      role: user.role,
      sid: sessionId,
    },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
}

function cookieNameForRole(role) {
  return ['faculty', 'admin', 'teacher'].includes(role)
    ? TEACHER_JWT_COOKIE_NAME
    : STUDENT_JWT_COOKIE_NAME;
}

function cookiePreferenceForRoles(roles = []) {
  if (roles.includes('student')) return [STUDENT_JWT_COOKIE_NAME, TEACHER_JWT_COOKIE_NAME, JWT_COOKIE_NAME];
  if (roles.some((role) => ['faculty', 'admin', 'teacher'].includes(role))) {
    return [TEACHER_JWT_COOKIE_NAME, STUDENT_JWT_COOKIE_NAME, JWT_COOKIE_NAME];
  }
  return [STUDENT_JWT_COOKIE_NAME, TEACHER_JWT_COOKIE_NAME, JWT_COOKIE_NAME];
}

function expireCookieHeader(name, secure = false) {
  return `${name}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function setAuthCookie(res, token, role = 'student') {
  const secure = process.env.NODE_ENV === 'production';
  const cookieName = cookieNameForRole(role);

  res.cookie?.(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });

  if (!res.cookie) {
    res.setHeader(
      'Set-Cookie',
      `${cookieName}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${8 * 60 * 60}${secure ? '; Secure' : ''}`
    );
  }
}

export function clearAuthCookie(res, role = 'all') {
  const secure = process.env.NODE_ENV === 'production';
  const names = role === 'student'
    ? [STUDENT_JWT_COOKIE_NAME]
    : ['faculty', 'admin', 'teacher'].includes(role)
      ? [TEACHER_JWT_COOKIE_NAME]
      : [STUDENT_JWT_COOKIE_NAME, TEACHER_JWT_COOKIE_NAME, JWT_COOKIE_NAME];

  if (res.clearCookie) {
    names.forEach((name) => res.clearCookie(name, { path: '/', sameSite: 'lax', secure }));
    return;
  }
  res.setHeader('Set-Cookie', names.map((name) => expireCookieHeader(name, secure)));
}

export async function getUserFromRequest(req, preferredRoles = []) {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }
  if (!token) {
    const roleHint = req.query?.role || req.body?.role;
    const roles = roleHint ? [roleHint] : preferredRoles;
    for (const cookieName of cookiePreferenceForRoles(roles)) {
      token = getCookie(req, cookieName);
      if (token) break;
    }
  }
  if (!token) return null;

  const decoded = jwt.verify(token, JWT_SECRET);
  const user = await User.findById(decoded.id);
  if (!user) return null;
  if (user.role === 'student') {
    // Older tokens intentionally cease to work after this rollout: without a
    // server-side session id they cannot be forcefully revoked.
    if (!decoded.sid) return null;
    const connection = await touchStudentConnection(decoded.sid);
    if (!connection || connection.userId !== user.user_id) return null;
    req.studentConnection = connection;
  }
  return user;
}

export const protect = async (req, res, next) => {
  try {
    req.user = await getUserFromRequest(req);
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    next();
  }
};

export const requireAuth = async (req, res, next) => {
  try {
    req.user = await getUserFromRequest(req);
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
};

// Role-based authorization
export const authorize = (...roles) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized, no user found' });
    }
    
    if (!roles.includes(req.user.role)) {
      req.user = await getUserFromRequest(req, roles);
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: 'Not authorized for this action' });
      }
    }
    
    next();
  };
};
