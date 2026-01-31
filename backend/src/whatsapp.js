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

/* ================= EXPORTS ================= */

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

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      latestQrImage = await QRCode.toDataURL(qr);
      isConnected = false;
      connectedNumber = null;
      io.emit("whatsapp:qr", latestQrImage);
      io.emit("whatsapp:status", { connected: false });
    }

    if (connection === "open") {
      isConnected = true;
      latestQrImage = null;
      connectedNumber = sock.user?.id?.split(":")[0];
      io.emit("whatsapp:ready");
      io.emit("whatsapp:status", { connected: true, number: connectedNumber });
      console.log("✅ WhatsApp Connected:", connectedNumber);
    }

    if (connection === "close") {
      isConnected = false;
      connectedNumber = null;
      io.emit("whatsapp:status", { connected: false });

      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !==
        DisconnectReason.loggedOut;

      if (shouldReconnect) startWhatsApp(io);
    }
  });

sock.ev.on("messages.upsert", async ({ messages, type }) => {
  if (type !== "notify") return;

  const msg = messages?.[0];
  if (!msg) return;
  if (!connectedNumber) return;

  const jid = msg.key?.remoteJid;
  if (!jid || jid === "status@broadcast") return;

  // ❌ ignore protocol/system messages
  if (msg.message?.protocolMessage) return;

  // ✅ extract text SAFELY
  let text = null;

  if (msg.message.conversation) {
    text = msg.message.conversation;
  } else if (msg.message.extendedTextMessage?.text) {
    text = msg.message.extendedTextMessage.text;
  }

  // ❌ if no text → DO NOT SAVE
  if (!text) return;

  console.log("📩 Saving message:", { jid, text });

  await Message.create({
    ownerNumber: connectedNumber,
    jid,
    fromMe: !!msg.key.fromMe,
    text,
    time: new Date(),
  });

  await Chat.findOneAndUpdate(
    { ownerNumber: connectedNumber, jid },
    {
      ownerNumber: connectedNumber,
      jid,
      lastMessage: text,
      lastTime: new Date(),
      isGroup: jid.endsWith("@g.us"),
      $inc: { unreadCount: msg.key.fromMe ? 0 : 1 },
    },
    { upsert: true }
  );

  io.emit("chat:newMessage", {
    ownerNumber: connectedNumber,
    jid,
    fromMe: msg.key.fromMe,
    text,
    time: new Date(),
  });
});



};
