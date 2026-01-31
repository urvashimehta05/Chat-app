import mongoose from "mongoose";

export const connectDB = async () => {
  try {
    const MONGO_URI = "mongodb+srv://Fooddata:123food%40%23website@cluster2.zzb73l8.mongodb.net/user-info?retryWrites=true&w=majority&appName=cluster2";

    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected");
  } catch (error) {
    console.log("❌ MongoDB Error:", error.message);
    process.exit(1);
  }
};
