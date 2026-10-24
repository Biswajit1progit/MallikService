/* import express from "express";
import { signup, login, googleAuth, refresh, logout } from "../controller/authcontroller.js";
import { verifyToken } from "../middleware/verifytoken.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/google", googleAuth);
router.post("/refresh", refresh);
router.post("/logout", logout);

// quick sanity-check route to confirm the token flow works end to end
router.get("/me", verifyToken, (req, res) => {
  res.json({ user: req.user });
});

export default router; */

import express from "express";
import { signup, login, googleAuth, refresh, logout, getMe, updateProfile } from "../controller/authController.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/google", googleAuth);
router.post("/refresh", refresh);
router.post("/logout", logout);

router.get("/me", verifyToken, getMe);
router.patch("/profile", verifyToken, updateProfile);

export default router;