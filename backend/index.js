import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";

import { connectDB } from "./db.js";
import { startWhatsApp, getConnectionStatus, getQrImage } from "./whatsapp.js";

import whatsappRoutes from "./routes/whatsappRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";

const app = express();
const server = http.createServer(app);
const port = process.env.PORT
app.use(cors({
  origin: "https://chat-app-2-5o2e.onrender.com/",
  credentials: true
}));
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "https://chat-app-2-5o2e.onrender.com/",
    credentials: true
  }
});

/* ✅ ADD THIS PART */
io.on("connection", (socket) => {
  console.log("🟢 Frontend connected:", socket.id);

  // send status immediately
  socket.emit("whatsapp:status", getConnectionStatus());

  // send QR immediately if available
  const qr = getQrImage();
  if (qr) socket.emit("whatsapp:qr", qr);
});
/* ✅ END */

// routes
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api", chatRoutes);

// start everything
const start = async () => {
  await connectDB();
  startWhatsApp(io);

  server.listen(port, () => {
    console.log(" Backend running on http://localhost:5000");
  });
};

start();
