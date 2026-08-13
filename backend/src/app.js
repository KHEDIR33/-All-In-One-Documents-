const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { checkDatabase } = require("./config/database");

const conversionRoutes = require("./routes/conversionRoutes");
const downloadRoutes   = require("./routes/downloadRoutes");
const paymentRoutes    = require("./routes/paymentRoutes");
const documentRoutes   = require("./routes/documentRoutes");
const botRoutes        = require("./routes/botRoutes");
const errorHandler     = require("./middleware/errorHandler");

const app = express();

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*" }));
app.use(helmet());
app.use(express.json());
app.use(morgan("combined"));
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: "Too many requests" }
}));

app.get("/", (_req, res) => res.json({
  success: true,
  service: "All-In-One Documents",
  status: "Online",
  database: "Supabase PostgreSQL",
  storage: "Supabase Storage"
}));

app.get("/health/db", async (_req, res, next) => {
  try {
    await checkDatabase();
    res.json({ success: true, database: "Supabase PostgreSQL", status: "healthy" });
  } catch (e) { next(e); }
});

app.use("/api/conversion", conversionRoutes);  // 7 engines
app.use("/api/download",   downloadRoutes);    // conversion result download
app.use("/api/payments",   paymentRoutes);     // payment + webhook
app.use("/api/documents",  documentRoutes);    // search + preview + document download
app.use("/bot",            botRoutes);         // Telegram bot webhook + setup

app.use(errorHandler);

module.exports = app;
