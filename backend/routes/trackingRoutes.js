/* import express from "express";
import { getTrackingInfo } from "../controller/trackingController.js";

const router = express.Router();

router.get("/:token", getTrackingInfo);

export default router; */

import express from "express";
import { getTrackingInfo, getBookingTrackingLink } from "../controller/trackingController.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { rateLimit } from "../middleware/ratelimit.js";

const router = express.Router();

// static-prefixed route first so it never gets swallowed by /:token
router.get("/booking/:id", verifyToken, getBookingTrackingLink);
// Public link: slow down anyone trying many tokens.
router.get("/:token", rateLimit({ name: "track", max: 60, windowSec: 60, memoryOnly: true }), getTrackingInfo);

export default router;


