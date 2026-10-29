import express from "express";
import { signup, login, googleAuth, refresh, logout, getMe, updateProfile } from "../controller/authcontroller.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { rateLimit } from "../middleware/ratelimit.js";

const router = express.Router();

// Brute-force and spam protection. Every number here is "per visitor address", and the login
// one is also "per email", so one person can't guess one account's password all day.
const loginPerAccount = rateLimit({
  name: "login-acct",
  max: 10,
  windowSec: 15 * 60,
  key: (req) => `${req.ip}:${req.body?.email}`,
});
const loginPerIp = rateLimit({ name: "login-ip", max: 40, windowSec: 15 * 60 });
const signupLimit = rateLimit({
  name: "signup",
  max: 5,
  windowSec: 60 * 60,
  message: "Too many sign-ups from this connection. Please try again in an hour.",
});
const googleLimit = rateLimit({ name: "google", max: 30, windowSec: 15 * 60 });
const refreshLimit = rateLimit({ name: "refresh", max: 120, windowSec: 15 * 60, memoryOnly: true });

router.post("/signup", signupLimit, signup);
router.post("/login", loginPerIp, loginPerAccount, login);
router.post("/google", googleLimit, googleAuth);
router.post("/refresh", refreshLimit, refresh);
router.post("/logout", logout);

router.get("/me", verifyToken, getMe);
router.patch("/profile", verifyToken, updateProfile);

export default router;