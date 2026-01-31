import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    ownerNumber: { type: String, required: true }, // ✅ whose account
    jid: { type: String, required: true },
    fromMe: { type: Boolean, default: false },
    text: { type: String, default: "" },
    time: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

messageSchema.index({ ownerNumber: 1, jid: 1, time: 1 });

export default mongoose.model("Message", messageSchema);
