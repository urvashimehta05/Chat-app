import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from "@whiskeysockets/baileys";

import NodeCache from "@cacheable/node-cache";
import P from "pino";
import QRCode from "qrcode";

import Chat from "./models/Chat.js";
import Message from "./models/Message.js";

const msgRetryCounterCache = new NodeCache();

let sock = null;
let latestQrImage = null;
let isConnected = false;
let connectedNumber = null;

// 🔑 socket.id -> active senderJid
const activeChats = new Map();

/* ================= GETTERS ================= */

export const getQrImage = () => latestQrImage;

export const getConnectionStatus = () => ({
  connected: isConnected,
  number: connectedNumber,
});

export const getSock = () => sock;

/* ================= SEND MESSAGE ================= */

export const sendMessage = async (number, text) => {
  if (!sock || !connectedNumber) {
    throw new Error("WhatsApp not connected");
  }

  const jid = `${number}@s.whatsapp.net`;

  await sock.sendMessage(jid, { text });

  // ✅ save sent message
  await Message.create({
    ownerNumber: connectedNumber,
    jid,
    fromMe: true,
    text,
    time: new Date(),
  });

  // ✅ update chat (NO unread increment for sent messages)
  await Chat.findOneAndUpdate(
    { ownerNumber: connectedNumber, jid },
    {
      ownerNumber: connectedNumber,
      jid,
      lastMessage: text,
      lastTime: new Date(),
      unreadCount: 0,
    },
    { upsert: true }
  );

  return jid;
};

/* ================= START WHATSAPP ================= */

export const startWhatsApp = async (io) => {
  const { state, saveCreds } = await useMultiFileAuthState("baileys_auth_info");
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, P({ level: "silent" })),
    },
    msgRetryCounterCache,
  });

  sock.ev.on("creds.update", saveCreds);

  /* ================= SOCKET.IO ================= */

  io.on("connection", (socket) => {
    socket.on("chat:active", (jid) => {
      if (jid) activeChats.set(socket.id, jid);
      else activeChats.delete(socket.id);
    });

    socket.on("disconnect", () => {
      activeChats.delete(socket.id);
    });
  });

  /* ================= CONNECTION STATUS ================= */

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      latestQrImage = await QRCode.toDataURL(qr);
      isConnected = false;
      connectedNumber = null;
      io.emit("whatsapp:qr", latestQrImage);
    }

    if (connection === "open") {
      isConnected = true;
      latestQrImage = null;
      connectedNumber = sock.user.id.split(":")[0];

      io.emit("whatsapp:ready");
      io.emit("whatsapp:status", {
        connected: true,
        number: connectedNumber,
      });
    }

    if (connection === "close") {
      isConnected = false;
      connectedNumber = null;

      if (
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut
      ) {
        startWhatsApp(io);
      }
    }
  });

  /* ================= RECEIVE MESSAGE ================= */

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    const msg = messages?.[0];
    if (!msg || !msg.message || !connectedNumber) return;

    // ❌ ignore status / system
    if (msg.key?.remoteJid === "status@broadcast") return;

    // ❌ ignore own messages (already saved)
    if (msg.key.fromMe) return;

    // ❌ ignore protocol messages
    if (msg.message.protocolMessage) return;

    // ✅ SINGLE SOURCE OF TRUTH → sender JID ONLY
    const jid = msg.key.participant || msg.key.remoteJid;
    if (!jid) return;

    const text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text;

    if (!text) return;

    // ✅ save received message
    await Message.create({
      ownerNumber: connectedNumber,
      jid,
      fromMe: false,
      text,
      time: new Date(),
    });

    // 🔑 unread logic (PER SOCKET)
    const isChatOpen =
      [...activeChats.entries()].some(
        ([, activeJid]) => activeJid === jid
      );
  await sock.readMessages([msg.key]);
    await Chat.findOneAndUpdate(
      { ownerNumber: connectedNumber, jid },
      {
        ownerNumber: connectedNumber,
        jid,
        lastMessage: text,
        lastTime: new Date(),
        ...(isChatOpen ? {} : { $inc: { unreadCount: 1 } }),
      },
      { upsert: true }
    );

    // ✅ emit to frontend
    io.emit("chat:newMessage", {
      ownerNumber: connectedNumber,
      jid,
      fromMe: false,
      text,
      time: new Date(),
    });
  });
};
import fs from "fs";
import path from "path";

export const logoutWhatsApp = async () => {
  try {
    if (sock) {
      await sock.logout(); // 🔥 tell WhatsApp server
      sock = null;
    }

    // 🔥 delete auth session
    const authPath = path.join(process.cwd(), "baileys_auth_info");
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
    }

    isConnected = false;
    connectedNumber = null;
    latestQrImage = null;

    console.log("✅ WhatsApp logged out");
  } catch (err) {
    console.error("Logout error:", err);
  }
};
