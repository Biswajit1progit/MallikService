import express from "express";
import { getPolicyHandler } from "../controller/Policycontroller.js";

const router = express.Router();
router.get("/", getPolicyHandler); // public, no login needed

export default router;