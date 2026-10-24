import express from "express";
import { adminListRefunds, adminRetryRefund, adminManualRefund } from "../controller/Refundcontrolle.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();
router.use(verifyToken, requireRole("admin"));

router.get("/admin", adminListRefunds);
router.post("/admin/booking/:bookingId", adminManualRefund);
router.post("/admin/:id/retry", adminRetryRefund);

export default router;