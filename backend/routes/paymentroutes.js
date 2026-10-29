import express from "express";
import { createOrder, verifyPayment } from "../controller/paymentController.js";
import { verifyToken } from "../middleware/verifyToken.js";
import { rateLimit } from "../middleware/ratelimit.js";

const router = express.Router();

router.use(verifyToken);

// Per logged-in customer, so one customer can't flood Razorpay with orders.
router.post(
  "/create-order",
  rateLimit({ name: "order", max: 10, windowSec: 60 * 60, key: (req) => `u${req.user.id}`, message: "Too many payment attempts. Please try again in a little while." }),
  createOrder
);
router.post("/verify", rateLimit({ name: "verify", max: 30, windowSec: 60 * 60, key: (req) => `u${req.user.id}` }), verifyPayment);

export default router;