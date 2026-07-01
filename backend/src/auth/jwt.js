import jwt from 'jsonwebtoken';

// The signing secret MUST be set in production (env var JWT_SECRET).
const secret = () => process.env.JWT_SECRET || 'dev-insecure-secret-change-me';

export const signToken = (userId) => jwt.sign({ userId }, secret(), { expiresIn: '7d' });

export function verifyToken(token) {
  try { return jwt.verify(token, secret()); }
  catch { return null; }
}
