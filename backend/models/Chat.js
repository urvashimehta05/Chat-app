import mongoose from "mongoose";

const chatSchema = new mongoose.Schema(
  {
    ownerNumber: {
      type: String,
      required: true,
      index: true,
    },
    jid: {
      type: String,
      required: true,
    },
    lastMessage: String,
    lastTime: Date,
    unreadCount: {
      type: Number,
      default: 0,
    },
    isGroup: {
      type: Boolean,
      default: false,
    },
    isBusiness: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);
chatSchema.index({ ownerNumber: 1, jid: 1 }, { unique: true });

export default mongoose.model("Chat", chatSchema);


