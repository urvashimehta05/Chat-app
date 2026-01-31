import express from "express";
import PDFDocument from "pdfkit";
import Chat from "../models/Chat.js";
import Message from "../models/Message.js";

import {
  getSock,
  getQrImage,
  getConnectionStatus,
  sendMessage,
} from "../whatsapp.js";

const router = express.Router();

/* ================= STATUS ================= */

router.get("/status", (req, res) => {
  res.json(getConnectionStatus());
});

router.get("/qr", (req, res) => {
  const qr = getQrImage();
  if (!qr) return res.status(404).json({ message: "QR not available" });
  res.json({ qr });
});
/* ================= CHECK NUMBER ================= */

router.get("/check/:number", async (req, res) => {
  try {
    const { number } = req.params;

    const sock = getSock();
    if (!sock) {
      return res.status(400).json({ message: "WhatsApp not connected" });
    }

    const result = await sock.onWhatsApp(number);

    if (!result || !result[0]?.exists) {
      return res.json({ exists: false });
    }

    return res.json({
      exists: true,
      jid: result[0].jid,
      number,
    });
  } catch (err) {
    console.error("CHECK ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* ================= SEND ================= */

router.post("/send", async (req, res) => {
  try {
    const { number, message } = req.body;
    if (!number || !message) {
      return res.status(400).json({ message: "number and message required" });
    }

    await sendMessage(number, message);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ================= EXPORT PDF ================= */

router.get("/export/pdf/:jid", async (req, res) => {
  const { jid } = req.params;
  const owner = getConnectionStatus().number;

  const messages = await Message.find({
    ownerNumber: owner,
    jid,
  }).sort({ time: 1 });

  const doc = new PDFDocument({ margin: 40 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=chat.pdf`);
  doc.pipe(res);

  doc.fontSize(16).text(`Chat with ${jid.split("@")[0]}`);
  doc.moveDown();

  messages.forEach((m) => {
    doc.fontSize(10).text(
      `${m.fromMe ? "Me" : "User"} | ${new Date(m.time).toLocaleString()}`
    );
    doc.fontSize(12).text(m.text);
    doc.moveDown();
  });

  doc.end();
});

export default router;
