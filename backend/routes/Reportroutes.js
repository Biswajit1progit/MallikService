import express from "express";
import { adminExport, adminUnpaid } from "../controller/Reportcontroller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();
router.use(verifyToken, requireRole("admin"));
router.get("/admin/export", adminExport);
router.get("/admin/unpaid", adminUnpaid);

export default router;