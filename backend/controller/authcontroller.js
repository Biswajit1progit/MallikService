/* import bcrypt from "bcrypt";
import { pool } from "../config/db.js";
import { verifyGoogleToken } from "../config/googleclient.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiryDate,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from "../utils/token.js";

// Helper: creates a refresh token row + sets cookie + returns access token
async function issueTokens(res, user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, hashToken(refreshToken), refreshTokenExpiryDate()]
  );

  setRefreshTokenCookie(res, refreshToken);
  return accessToken;
}

export async function signup(req, res) {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, auth_provider, role)
       VALUES ($1, $2, $3, $4, 'local', 'customer')
       RETURNING id, name, email, phone, role`,
      [name, email, phone || null, passwordHash]
    );

    const user = result.rows[0];
    const accessToken = await issueTokens(res, user);

    res.status(201).json({ user, accessToken });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Something went wrong during signup" });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user || !user.password_hash) {
      // covers both "no account" and "account exists but is Google-only"
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: "This account has been deactivated" });
    }

    const accessToken = await issueTokens(res, user);

    res.json({
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
      accessToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Something went wrong during login" });
  }
}

export async function googleAuth(req, res) {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "Google ID token is required" });
    }

    const payload = await verifyGoogleToken(idToken);
    const { sub: googleId, email, name } = payload;

    let result = await pool.query("SELECT * FROM users WHERE google_id = $1 OR email = $2", [
      googleId,
      email,
    ]);
    let user = result.rows[0];

    if (!user) {
      // new user via Google
      const insertResult = await pool.query(
        `INSERT INTO users (name, email, google_id, auth_provider, role)
         VALUES ($1, $2, $3, 'google', 'customer')
         RETURNING id, name, email, phone, role`,
        [name, email, googleId]
      );
      user = insertResult.rows[0];
    } else if (!user.google_id) {
      // existing local-signup user is now linking Google to the same email
      await pool.query("UPDATE users SET google_id = $1 WHERE id = $2", [googleId, user.id]);
    }

    const accessToken = await issueTokens(res, user);

    res.json({
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role },
      accessToken,
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ message: "Google authentication failed" });
  }
}

export async function refresh(req, res) {
  try {
    const oldToken = req.cookies?.refreshToken;
    if (!oldToken) {
      return res.status(401).json({ message: "No refresh token provided" });
    }

    const tokenHash = hashToken(oldToken);
    const result = await pool.query(
      `SELECT rt.*, u.id as user_id, u.role, u.email, u.name, u.phone
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now()`,
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    // Rotate: revoke the old refresh token, issue a new one (prevents reuse if stolen)
    await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [row.id]);

    const user = { id: row.user_id, role: row.role, email: row.email };
    const accessToken = await issueTokens(res, user);

    res.json({ accessToken });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ message: "Something went wrong refreshing your session" });
  }
}

export async function logout(req, res) {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1", [
        hashToken(token),
      ]);
    }
    clearRefreshTokenCookie(res);
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Something went wrong during logout" });
  }
} */


 import bcrypt from "bcrypt";
import { pool } from "../config/db.js";
import { verifyGoogleToken } from "../config/googleClient.js";
import {
  generateAccessToken,
  generateRefreshToken,
  hashToken,
  refreshTokenExpiryDate,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
} from "../utils/token.js";

// 10-digit Indian mobile (6-9 start); strips +91 / spaces / dashes
export function normalizePhone(input) {
  if (!input) return null;
  const digits = String(input).replace(/\D/g, "");
  const ten = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  return /^[6-9]\d{9}$/.test(ten) ? ten : null;
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    needsPhone: !u.phone, // frontend forces profile completion when true
  };
}

// Helper: creates a refresh token row + sets cookie + returns access token
async function issueTokens(res, user) {
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken();

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)`,
    [user.id, hashToken(refreshToken), refreshTokenExpiryDate()]
  );

  setRefreshTokenCookie(res, refreshToken);
  return accessToken;
}

export async function signup(req, res) {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required" });
    }
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      return res.status(400).json({ message: "Enter a valid 10-digit mobile number" });
    }
    const phoneTaken = await pool.query("SELECT 1 FROM users WHERE phone = $1", [cleanPhone]);
    if (phoneTaken.rows.length > 0) {
      return res.status(409).json({ message: "This mobile number is already registered" });
    }

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "An account with this email already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, auth_provider, role)
       VALUES ($1, $2, $3, $4, 'local', 'customer')
       RETURNING id, name, email, phone, role`,
      [name, email, cleanPhone, passwordHash]
    );

    const user = result.rows[0];
    const accessToken = await issueTokens(res, user);

    res.status(201).json({ user: publicUser(user), accessToken });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Something went wrong during signup" });
  }
}

export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user || !user.password_hash) {
      // covers both "no account" and "account exists but is Google-only"
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: "This account has been deactivated" });
    }

    const accessToken = await issueTokens(res, user);

    res.json({
      user: publicUser(user),
      accessToken,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Something went wrong during login" });
  }
}

export async function googleAuth(req, res) {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ message: "Google ID token is required" });
    }

    const payload = await verifyGoogleToken(idToken);
    const { sub: googleId, email, name } = payload;

    let result = await pool.query("SELECT * FROM users WHERE google_id = $1 OR email = $2", [
      googleId,
      email,
    ]);
    let user = result.rows[0];

    if (!user) {
      // new user via Google
      const insertResult = await pool.query(
        `INSERT INTO users (name, email, google_id, auth_provider, role)
         VALUES ($1, $2, $3, 'google', 'customer')
         RETURNING id, name, email, phone, role`,
        [name, email, googleId]
      );
      user = insertResult.rows[0];
    } else if (!user.google_id) {
      // existing local-signup user is now linking Google to the same email
      await pool.query("UPDATE users SET google_id = $1 WHERE id = $2", [googleId, user.id]);
    }

    const accessToken = await issueTokens(res, user);

    res.json({
      user: publicUser(user),
      accessToken,
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ message: "Google authentication failed" });
  }
}

export async function refresh(req, res) {
  try {
    const oldToken = req.cookies?.refreshToken;
    if (!oldToken) {
      return res.status(401).json({ message: "No refresh token provided" });
    }

    const tokenHash = hashToken(oldToken);
    const result = await pool.query(
      `SELECT rt.*, u.id as user_id, u.role, u.email, u.name, u.phone
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now()`,
      [tokenHash]
    );

    const row = result.rows[0];
    if (!row) {
      clearRefreshTokenCookie(res);
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    // Rotate: revoke the old refresh token, issue a new one (prevents reuse if stolen)
    await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1", [row.id]);

    const user = { id: row.user_id, role: row.role, email: row.email };
    const accessToken = await issueTokens(res, user);

    res.json({ accessToken, user: publicUser({ ...user, name: row.name, phone: row.phone }) });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ message: "Something went wrong refreshing your session" });
  }
}

export async function logout(req, res) {
  try {
    const token = req.cookies?.refreshToken;
    if (token) {
      await pool.query("UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1", [
        hashToken(token),
      ]);
    }
    clearRefreshTokenCookie(res);
    res.json({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    res.status(500).json({ message: "Something went wrong during logout" });
  }
}

export async function getMe(req, res) {
  try {
    const r = await pool.query(
      "SELECT id, name, email, phone, role FROM users WHERE id = $1 AND is_active = true",
      [req.user.id]
    );
    if (!r.rows[0]) return res.status(404).json({ message: "User not found" });
    res.json({ user: publicUser(r.rows[0]) });
  } catch (err) {
    console.error("Get me error:", err);
    res.status(500).json({ message: "Couldn't load your profile" });
  }
}

// Used by the one-time "complete your profile" step (Google users) and profile edits.
export async function updateProfile(req, res) {
  try {
    const { phone, name } = req.body;
    const cleanPhone = normalizePhone(phone);
    if (!cleanPhone) {
      return res.status(400).json({ message: "Enter a valid 10-digit mobile number" });
    }
    const taken = await pool.query("SELECT 1 FROM users WHERE phone = $1 AND id <> $2", [
      cleanPhone,
      req.user.id,
    ]);
    if (taken.rows.length > 0) {
      return res.status(409).json({ message: "This mobile number is already registered" });
    }
    const r = await pool.query(
      `UPDATE users
       SET phone = $1::varchar,
           name = COALESCE(NULLIF($2::text, ''), name)
       WHERE id = $3
       RETURNING id, name, email, phone, role`,
      [cleanPhone, name?.trim() || "", req.user.id]
    );
    res.json({ user: publicUser(r.rows[0]) });
  } catch (err) {
    console.error("Update profile error:", err);
    res.status(500).json({ message: "Couldn't update your profile" });
  }
}