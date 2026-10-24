import express from "express";
import {
  getMyProfile,
  listMyJobs,
  updateMyJobStatus,
  reportJobIssue,
  startCall,
  recordCallOutcome,
  adminListTechnicians,
  adminCreateTechnician,
  adminUpdateTechnician,
  adminAssignBooking,
} from "../controller/Techniciancontroller1.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";
import { requireTechnician } from "../utils/technicianContext.js";

const router = express.Router();
router.use(verifyToken);

// ---- Admin (registered first so "/admin/..." never matches "/jobs/:id" style routes) ----
router.get("/admin/list", requireRole("admin"), adminListTechnicians);
router.post("/admin", requireRole("admin"), adminCreateTechnician);
router.patch("/admin/bookings/:id/assign", requireRole("admin"), adminAssignBooking);
router.patch("/admin/:id", requireRole("admin"), adminUpdateTechnician);

// ---- Technician (own jobs only; requireTechnician sets req.technician) ----
router.get("/me", requireTechnician, getMyProfile);
router.get("/jobs", requireTechnician, listMyJobs);
router.patch("/jobs/:id/status", requireTechnician, updateMyJobStatus);
router.post("/jobs/:id/issue", requireTechnician, reportJobIssue);
router.post("/jobs/:id/call/start", requireTechnician, startCall);
router.post("/jobs/:id/call/outcome", requireTechnician, recordCallOutcome);

export default router;