import express from "express";
import { listServices, getServiceById } from "../controller/serviceController.js";

const router = express.Router();

router.get("/", listServices);
router.get("/:id", getServiceById);

export default router;