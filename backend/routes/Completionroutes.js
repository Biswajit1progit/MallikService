/* import express from "express";
import {
  submitCompletion,
  getCompletionForBooking,
  approveCompletion,
  adminApproveCompletion,
  disputeCompletion,
  listMyWarranties,
  adminLookupWarranties,
} from "../controller/Completioncontroller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

router.use(verifyToken);

// Fixed paths first, then the /booking/:id family
router.get("/my-warranties", listMyWarranties);
router.get("/admin/warranties", requireRole("admin"), adminLookupWarranties);

router.post("/booking/:id", requireRole("admin"), submitCompletion);
router.get("/booking/:id", getCompletionForBooking);
router.post("/booking/:id/approve", approveCompletion);
router.post("/booking/:id/dispute", disputeCompletion);
router.post("/booking/:id/admin-approve", requireRole("admin"), adminApproveCompletion);

export default router; */






import express from "express";
import {
  submitCompletion,
  getCompletionForBooking,
  approveCompletion,
  adminApproveCompletion,
  disputeCompletion,
  listMyWarranties,
  adminLookupWarranties,
} from "../controller/Completioncontroller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();

router.use(verifyToken);

// Fixed paths first, then the /booking/:id family
router.get("/my-warranties", listMyWarranties);
router.get("/admin/warranties", requireRole("admin"), adminLookupWarranties);

// Technician (own jobs only - enforced in the controller) or admin submits the report
router.post("/booking/:id", requireRole("admin", "technician"), submitCompletion);
router.get("/booking/:id", getCompletionForBooking); // owner customer, assigned technician, or admin (checked in controller)
router.post("/booking/:id/approve", approveCompletion);
router.post("/booking/:id/dispute", disputeCompletion);
router.post("/booking/:id/admin-approve", requireRole("admin"), adminApproveCompletion);

export default router;