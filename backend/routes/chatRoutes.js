import express from "express";
import Chat from "../models/Chat.js";
import Message from "../models/Message.js";
import { getConnectionStatus } from "../whatsapp.js";
import { logoutWhatsApp } from "../whatsapp.js";
const router = express.Router();

/* ================= GET OWNER ================= */
const getOwner = () => getConnectionStatus().number;

/* ================= CHATS ================= */

// all chats
router.get("/chats", async (req, res) => {
  const ownerNumber = getOwner();
  if (!ownerNumber) return res.json([]);

  const chats = await Chat.find({ ownerNumber }).sort({ lastTime: -1 });
  res.json(chats);
});

// unread chats
router.get("/chats/unread", async (req, res) => {
  const ownerNumber = getOwner();
  if (!ownerNumber) return res.json([]);

  const chats = await Chat.find({
    ownerNumber,
    unreadCount: { $gt: 0 },
  }).sort({ lastTime: -1 });

  res.json(chats);
});

// group chats
router.get("/chats/groups", async (req, res) => {
  const ownerNumber = getOwner();
  if (!ownerNumber) return res.json([]);

  const chats = await Chat.find({
    ownerNumber,
    isGroup: true,
  }).sort({ lastTime: -1 });

  res.json(chats);
});

// business chats
router.get("/chats/business", async (req, res) => {
  const ownerNumber = getOwner();
  if (!ownerNumber) return res.json([]);

  const chats = await Chat.find({
    ownerNumber,
    isBusiness: true,
  }).sort({ lastTime: -1 });

  res.json(chats);
});
router.post("/chats/read/:jid", async (req, res) => {
  const ownerNumber = getOwner();
  const { jid } = req.params;

  const result = await Chat.findOneAndUpdate(
    { ownerNumber, jid },
    { unreadCount: 0 },
    { new: true }
  );

  console.log("UPDATED CHAT", result);

  res.json({ success: true, chat: result });
});

/* ================= MESSAGES ================= */

router.get("/messages/:jid", async (req, res) => {
  const ownerNumber = getOwner();
  const { jid } = req.params;

  if (!ownerNumber) return res.json([]);

  const messages = await Message.find({
    ownerNumber,
    jid,
  }).sort({ time: 1 });

  res.json(messages);
});


router.post("/whatsapp/logout", async (req, res) => {
  await logoutWhatsApp();
  res.json({ success: true });
});

export default router;
