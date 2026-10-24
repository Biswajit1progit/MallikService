import express from "express";
import {
  createBooking,
  listMyBookings,
  getMyBookingById,
  cancelBooking,
  rescheduleBooking,
  checkAvailability,
  adminListAllBookings,
  adminUpdateStatus,
  adminReschedule,
  adminEarnings,
  reportNoCall,
} from "../controller/bookingController.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

router.use(verifyToken); // every booking route requires a logged-in user

// Admin routes MUST be registered before /:id below - otherwise Express
// matches "/admin/all" against the ":id" pattern first (treating "admin"
// as an id value) and these routes would never be reached.
router.get("/admin/all", requireRole("admin"), adminListAllBookings);
router.get("/admin/earnings", requireRole("admin"), adminEarnings);
router.patch("/admin/:id/status", requireRole("admin"), adminUpdateStatus);
router.patch("/admin/:id/reschedule", requireRole("admin"), adminReschedule);

// Availability check must also come before /:id for the same reason
router.get("/availability", checkAvailability);

// Customer routes
router.post("/", createBooking);
router.get("/", listMyBookings);
router.get("/:id", getMyBookingById);
router.patch("/:id/cancel", cancelBooking);
router.patch("/:id/reschedule", rescheduleBooking);
router.post("/:id/report-no-call", reportNoCall);

export default router;