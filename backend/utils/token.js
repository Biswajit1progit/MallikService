import jwt from "jsonwebtoken";
import crypto from "crypto";

export function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, email: user.email },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m" }
  );
}

export function generateRefreshToken() {
  // random opaque token - not a JWT. We store its hash in DB and can revoke it anytime.
  return crypto.randomBytes(64).toString("hex");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiryDate() {
  const days = parseInt(process.env.REFRESH_TOKEN_EXPIRY) || 7;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export function setRefreshTokenCookie(res, token) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, keep in sync with REFRESH_TOKEN_EXPIRY
    path: "/api/auth", // cookie only sent to auth routes, not every request
  });
}

export function clearRefreshTokenCookie(res) {
  res.clearCookie("refreshToken", { path: "/api/auth" });
}