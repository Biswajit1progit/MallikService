import express from "express";
import {
  adminListActivity,
  adminAcknowledge,
  adminAcknowledgeAll,
  adminOverview,
} from "../controller/Activitycontroller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();
router.use(verifyToken, requireRole("admin"));

router.get("/admin", adminListActivity);
router.get("/admin/overview", adminOverview);
router.post("/admin/ack-all", adminAcknowledgeAll);
router.post("/admin/:id/ack", adminAcknowledge);

export default router;