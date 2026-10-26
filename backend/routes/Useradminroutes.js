import express from "express";
import { listUsers, listBlocked, removeUser, blacklistUser, unblock } from "../controller/Useradmincontroller.js";
import { verifyToken, requireRole } from "../middleware/verifyToken.js";

const router = express.Router();
router.use(verifyToken, requireRole("admin"));

router.get("/", listUsers);
router.get("/blocked", listBlocked); // before "/:id" routes
router.delete("/blocked/:id", unblock);
router.post("/:id/remove", removeUser);
router.post("/:id/blacklist", blacklistUser);

export default router;