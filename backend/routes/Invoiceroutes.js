import express from "express";
import { getInvoice, adminMarkCollected } from "../controller/Invoicecontroller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();
router.use(verifyToken);

router.get("/booking/:bookingId/:kind", getInvoice);
router.post("/admin/booking/:bookingId/collected", requireRole("admin"), adminMarkCollected);

export default router;