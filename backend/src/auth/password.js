import bcrypt from 'bcryptjs';

// Passwords are never stored in plain text — only their bcrypt hash.
export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw, hash) => bcrypt.compare(pw, hash);
