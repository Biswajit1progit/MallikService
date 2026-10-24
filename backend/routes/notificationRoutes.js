import express from "express";
import { listMine, markRead, markAllRead, pushConfig, subscribePush, unsubscribePush, sendTest } from "../controller/notificationController.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();
router.use(verifyToken);

router.get("/", listMine);
router.post("/read-all", markAllRead);
router.get("/push/config", pushConfig);
router.post("/push/subscribe", subscribePush);
router.post("/push/unsubscribe", unsubscribePush);
router.post("/test", sendTest);
router.patch("/:id/read", markRead);

export default router;