import { verifyToken } from '../auth/jwt.js';

function bearer(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

/** Reject the request unless a valid JWT is present. Sets req.userId. */
export function requireAuth(req, res, next) {
  const payload = verifyToken(bearer(req));
  if (!payload) return res.status(401).json({ error: 'Not authenticated' });
  req.userId = payload.userId;
  next();
}

/** Attach req.userId if a valid token is present, but don't require it. */
export function optionalAuth(req, _res, next) {
  const payload = verifyToken(bearer(req));
  if (payload) req.userId = payload.userId;
  next();
}
