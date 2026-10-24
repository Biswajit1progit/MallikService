import express from "express";
import { createAddress, listAddresses, deleteAddress } from "../controller/addressController.js";
import { verifyToken } from "../middleware/verifyToken.js";

const router = express.Router();

router.use(verifyToken); // every route below requires a logged-in user

router.post("/", createAddress);
router.get("/", listAddresses);
router.delete("/:id", deleteAddress);

export default router;