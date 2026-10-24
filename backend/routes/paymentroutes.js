import express from "express";
import { createOrder, verifyPayment } from "../controller/paymentController.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

router.use(verifyToken);

router.post("/create-order", createOrder);
router.post("/verify", verifyPayment);

export default router;