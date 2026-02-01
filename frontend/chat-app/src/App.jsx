import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { io } from "socket.io-client";
import "./App.css";
import Linkify from "linkify-react";
const socket = io(import.meta.env.VITE_API_URL);

export default function App() {
  const [status, setStatus] = useState("loading...");
  const [qr, setQr] = useState(null);

  const [filter, setFilter] = useState("all");
  const [chats, setChats] = useState([]);
  const [selectedJid, setSelectedJid] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);

  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [waSearchResult, setWaSearchResult] = useState(null);

  const getPhoneNumber = (jid) => (jid ? jid.split("@")[0] : "");

  /* ================= LOAD CHATS ================= */

const loadChats = async (type = filter) => {
  let url = "/api/chats";
  if (type === "unread") url = "/api/chats/unread";
  if (type === "groups") url = "/api/chats/groups";
  if (type === "business") url = "/api/chats/business";

  const res = await api.get(url);

  // unread filter must be pure API truth
  if (type === "unread") {
    setChats(res.data.filter(c => c.unreadCount > 0));
  } else {
    setChats(res.data);
  }
};

  /* ================= LOAD MESSAGES ================= */

  const loadMessages = async (jid) => {
    if (!jid) return;
    const res = await api.get(`/api/messages/${encodeURIComponent(jid)}`);
    setMessages(res.data);
  };

  const logout = async () => {
  await api.post("/api/whatsapp/logout");
  setStatus("disconnected");
  setChats([]);
  setMessages([]);
  setSelectedJid(null);
};


  const sendMessage = async () => {
    if (!selectedJid || !text.trim() || sending) return;

    const tempMessage = {
      _id: Date.now(),
      jid: selectedJid,
      fromMe: true,
      text,
      time: new Date(),
    };

    setMessages((prev) => [...prev, tempMessage]);
    setText("");
    setSending(true);

    try {
      await api.post("/api/whatsapp/send", {
        number: getPhoneNumber(selectedJid),
        message: tempMessage.text,
      });

      if (filter === "all") {
        await loadChats("all");
      }
    } catch {
      alert("Send failed");
    } finally {
      setSending(false);
    }
  };

useEffect(() => {
  // 🔥 Reset local chats when switching to unread
  if (filter === "unread") {
    setChats([]);
    setSelectedJid(null);
  }

  loadChats(filter);
}, [filter]);


  useEffect(() => {
    if (!selectedJid) return;

    loadMessages(selectedJid);

    // ✅ mark as read (backend)
    api.post(`/api/chats/read/${encodeURIComponent(selectedJid)}`);

    // ✅ instantly remove from unread list (frontend)
    if (filter === "unread") {
      setChats((prev) => prev.filter((c) => c.jid !== selectedJid));
    }
  }, [selectedJid, filter]);

  /* ================= SOCKET ================= */
useEffect(() => {
  socket.emit("chat:active", selectedJid);
}, [selectedJid]);

  useEffect(() => {
    socket.on("whatsapp:status", (data) => {
      setStatus(data.connected ? "connected" : "disconnected");
    });

    socket.on("whatsapp:qr", (qrData) => {
      setQr(qrData);
      setStatus("disconnected");
    });

    socket.on("whatsapp:ready", () => {
      setQr(null);
      setStatus("connected");
    });

    socket.on("chat:newMessage", (msg) => {
      // ❌ NEVER mutate chat list in unread mode
      if (filter !== "all") {
        if (msg.jid === selectedJid) {
          setMessages((prev) => [...prev, msg]);
        }
        return;
      }

      // ✅ ALL filter behavior
      setChats((prev) => {
        const others = prev.filter((c) => c.jid !== msg.jid);
        return [
          {
            _id: msg.jid,
            jid: msg.jid,
            lastMessage: msg.text,
          },
          ...others,
        ];
      });

      if (msg.jid === selectedJid) {
        setMessages((prev) => [...prev, msg]);
      }
    });

    return () => {
      socket.off("whatsapp:status");
      socket.off("whatsapp:qr");
      socket.off("whatsapp:ready");
      socket.off("chat:newMessage");
    };
  }, [selectedJid, filter]);

  /* ================= SEARCH ================= */

  useEffect(() => {
    const timer = setTimeout(async () => {
      const q = search.trim();
      if (!/^\d{10,15}$/.test(q)) {
        setWaSearchResult(null);
        return;
      }

      try {
        const res = await api.get(`/api/whatsapp/check/${q}`);
        setWaSearchResult(res.data);
      } catch {
        setWaSearchResult(null);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [search]);

  const filteredChats = useMemo(() => {
    const query = search.replace(/\D/g, "");
    let list = chats.filter((c) =>
      getPhoneNumber(c.jid).includes(query)
    );

    if (
      waSearchResult?.exists &&
      waSearchResult.jid.includes(query)
    ) {
      const exists = chats.some((c) => c.jid === waSearchResult.jid);
      if (!exists) {
        list = [
          {
            _id: "wa",
            jid: waSearchResult.jid,
            lastMessage: "Available on WhatsApp",
          },
          ...list,
        ];
      }
    }

    return list;
  }, [chats, search, waSearchResult]);


  return (
    <div className="page">
      <div className="sidebar">
<div className="sidebarHeader">
  <div className="header-option-1">
  Status: <b>{status}</b>
</div>
<div className="header-option-2">
  {status === "connected" && (
    <button className="logoutBtn" onClick={logout}>
      Logout
    </button>
  )}
  </div>
</div>
        {status !== "connected" && (
          <div className="qrBox">
            {qr ? <img src={qr} width="200" /> : "Scan QR from WhatsApp"}
          </div>
        )}

        <input
          className="search"
          placeholder="Search number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <div className="filterBar">
          {["all", "unread", "groups", "business"].map((f) => (
            <button
              key={f}
              className={filter === f ? "filterActive" : "filterBtn"}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="chatList">
          {filteredChats.map((c) => (
            <div
              key={c._id}
              className={`chatItem ${
                selectedJid === c.jid ? "chatActive" : ""
              }`}
              onClick={() => setSelectedJid(c.jid)}
            >
              <div className="avatar">
                {getPhoneNumber(c.jid)[0]}
              </div>
              <div>
                <b>{getPhoneNumber(c.jid)}</b>
                <div className="last">{c.lastMessage}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="chatWindow">
        {!selectedJid ? (
          <div className="empty">Select a chat</div>
        ) : (
          <>
            <div className="chatHeader">
              <b>{getPhoneNumber(selectedJid)}</b>
            </div>

            <div className="messages">
              {messages.map((m) => (
               <div className={`bubble ${m.fromMe ? "me" : "user"}`}>
  <Linkify
    options={{
      target: "_blank",
      rel: "noopener noreferrer",
      className: "wa-link",
    }}
  >
    {m.text}
  </Linkify>
</div>

              ))}
            </div>

            <div className="inputBox">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                disabled={status !== "connected"}
                placeholder="Type a message..."
              />
              <button onClick={sendMessage} disabled={sending}>
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
