import axios from "axios";

export const api = axios.create({
  baseURL: "https://chat-app-1-ujr1.onrender.com/",
});
