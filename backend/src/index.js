import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

import { connectDB } from "./db.js";
import { startWhatsApp } from "./whatsapp.js";

import whatsappRoutes from "./routes/whatsappRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";

dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: "http://localhost:5173", credentials: true }));
app.use(express.json());

const io = new Server(server, {
  cors: { origin: "http://localhost:5173", credentials: true },
});

app.use("/api/whatsapp", whatsappRoutes);
app.use("/api", chatRoutes);

const start = async () => {
  await connectDB();
  startWhatsApp(io);

  server.listen(process.env.PORT || 5000, () => {
    console.log("🚀 Backend running on http://localhost:5000");
  });
};

start();
