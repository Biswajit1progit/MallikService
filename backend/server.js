/* 
import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import authRoutes from "./routes/authRoutes.js";
import serviceRoutes from "./routes/serviceRoutes.js";
import addressRoutes from "./routes/addressRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import trackingRoutes from "./routes/trackingRoutes.js";
import completionRoutes from "./routes/completionRoutes.js";
import technicianRoutes from "./routes/technicianRoutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import refundRoutes from "./routes/refundRoutes.js";
import policyRoutes from "./routes/policyRoutes.js";
import invoiceRoutes from "./routes/Invoiceroutes.js";
import reportRoutes from "./routes/Reportroutes.js";
import { expireStalePendingBookings } from "./utils/bookingExpiry.js";
import { flagOverdueCalls } from "./utils/CallDue.js";
import { resolveTrackingToken } from "./utils/trackingToken.js";
import { redis } from "./config/redis.js";
import { pool } from "./config/db.js";
import { setIO } from "./utils/socketInstance.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true, // required so the browser sends/receives the httpOnly refresh cookie
  })
);
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/completions", completionRoutes);
app.use("/api/technician", technicianRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/policy", policyRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/reports", reportRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

// --- Socket.io setup for live technician tracking ---------------------
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
});
setIO(io);

io.on("connection", (socket) => {
  // Public tracking page joins a room scoped to its booking, after we
  // validate the token server-side - this stops anyone from just guessing
  // a booking ID and watching a stranger's technician move around.
  socket.on("join-tracking", async ({ token }) => {
    const tokenRow = await resolveTrackingToken(token);
    if (!tokenRow) {
      socket.emit("tracking-error", { message: "Invalid or expired tracking link" });
      return;
    }
    socket.join(`booking:${tokenRow.booking_id}`);
  });

  // The technician's phone (or the admin) sends this. It carries the sender's access
  // token so we can verify it is genuinely an authenticated technician/admin - and a
  // technician may only push location for a booking assigned to THEM.
  socket.on("update-location", async ({ bookingId, lat, lng, accessToken }) => {
    try {
      const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
      if (decoded.role !== "admin" && decoded.role !== "technician") return;

      const bookingResult = await pool.query(
        `SELECT b.status, t.user_id AS technician_user_id
         FROM bookings b LEFT JOIN technicians t ON t.id = b.technician_id
         WHERE b.id = $1`,
        [bookingId]
      );
      const row = bookingResult.rows[0];
      if (row?.status !== "ON_THE_WAY") return; // stale push after job moved on
      if (decoded.role === "technician" && row.technician_user_id !== decoded.id) return; // not their job

      const locationData = { lat, lng, updatedAt: new Date().toISOString() };
      await redis.set(`location:${bookingId}`, JSON.stringify(locationData), { ex: 600 });

      io.to(`booking:${bookingId}`).emit("location-update", locationData);
    } catch (err) {
      // Invalid/expired token, or any other hiccup - just drop this update,
      // no need to crash the socket connection over one bad push.
      console.error("update-location error:", err.message);
    }
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Sweep for unpaid/stale bookings every 5 minutes
  setInterval(expireStalePendingBookings, 5 * 60 * 1000);
  // Every 5 minutes: put a red "call overdue" line in the admin feed for visits nobody has confirmed by phone in time
  flagOverdueCalls();
  setInterval(flagOverdueCalls, 5 * 60 * 1000);
}); */



import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import authRoutes from "./routes/authRoutes.js";
import serviceRoutes from "./routes/serviceroutes.js";
import addressRoutes from "./routes/addressroutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import paymentRoutes from "./routes/paymentroutes.js";
import trackingRoutes from "./routes/trackingRoutes.js";
import completionRoutes from "./routes/Completionroutes.js";
import technicianRoutes from "./routes/Technicianroutes.js";
import activityRoutes from "./routes/activityRoutes.js";
import refundRoutes from "./routes/Refundroutes.js";
import policyRoutes from "./routes/Policyroutes.js";
import invoiceRoutes from "./routes/Invoiceroutes.js";
import reportRoutes from "./routes/Reportroutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import { expireStalePendingBookings } from "./utils/bookingExpiry.js";
import { flagOverdueCalls } from "./utils/CallDue.js";
import { deliverPending } from "./utils/pushDelivery.js";
import { sendVisitReminders } from "./utils/visitReminders.js";
import { resolveTrackingToken } from "./utils/trackingToken.js";
import { redis } from "./config/redis.js";
import { pool } from "./config/db.js";
import { setIO } from "./utils/socketInstance.js";
import userAdminRoutes from "./routes/Useradminroutes.js";

dotenv.config();

const app = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true, // required so the browser sends/receives the httpOnly refresh cookie
  })
);
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/tracking", trackingRoutes);
app.use("/api/completions", completionRoutes);
app.use("/api/technician", technicianRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/policy", policyRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/admin/users", userAdminRoutes);

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

// --- Socket.io setup for live technician tracking ---------------------
const httpServer = http.createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  },
});
setIO(io);

io.on("connection", (socket) => {
  // Public tracking page joins a room scoped to its booking, after we
  // validate the token server-side - this stops anyone from just guessing
  // a booking ID and watching a stranger's technician move around.
  socket.on("join-tracking", async ({ token }) => {
    const tokenRow = await resolveTrackingToken(token);
    if (!tokenRow) {
      socket.emit("tracking-error", { message: "Invalid or expired tracking link" });
      return;
    }
    socket.join(`booking:${tokenRow.booking_id}`);
  });

  // A logged-in page joins its own private room so new alerts appear in the bell instantly.
  // The room name comes from the verified token, never from what the browser claims.
  socket.on("join-user", ({ accessToken }) => {
    try {
      const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
      socket.join(`user:${decoded.id}`);
    } catch {
      /* expired token: the bell falls back to its 60-second refresh */
    }
  });

  // The technician's phone (or the admin) sends this. It carries the sender's access
  // token so we can verify it is genuinely an authenticated technician/admin - and a
  // technician may only push location for a booking assigned to THEM.
  socket.on("update-location", async ({ bookingId, lat, lng, accessToken }) => {
    try {
      const decoded = jwt.verify(accessToken, process.env.JWT_ACCESS_SECRET);
      if (decoded.role !== "admin" && decoded.role !== "technician") return;

      const bookingResult = await pool.query(
        `SELECT b.status, t.user_id AS technician_user_id
         FROM bookings b LEFT JOIN technicians t ON t.id = b.technician_id
         WHERE b.id = $1`,
        [bookingId]
      );
      const row = bookingResult.rows[0];
      if (row?.status !== "ON_THE_WAY") return; // stale push after job moved on
      if (decoded.role === "technician" && row.technician_user_id !== decoded.id) return; // not their job

      const locationData = { lat, lng, updatedAt: new Date().toISOString() };
      await redis.set(`location:${bookingId}`, JSON.stringify(locationData), { ex: 600 });

      io.to(`booking:${bookingId}`).emit("location-update", locationData);
    } catch (err) {
      // Invalid/expired token, or any other hiccup - just drop this update,
      // no need to crash the socket connection over one bad push.
      console.error("update-location error:", err.message);
    }
  });
});

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  // Sweep for unpaid/stale bookings every 5 minutes
  setInterval(expireStalePendingBookings, 5 * 60 * 1000);
  // Every 5 minutes: put a red "call overdue" line in the admin feed for visits nobody has confirmed by phone in time
  flagOverdueCalls();
  setInterval(flagOverdueCalls, 5 * 60 * 1000);
  // Phone/bell delivery every 4 seconds; time-based reminders every 5 minutes
  setInterval(deliverPending, 4000);
  sendVisitReminders();
  setInterval(sendVisitReminders, 5 * 60 * 1000);
});