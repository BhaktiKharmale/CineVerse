// src/apiClient.ts
import axios from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001"}/api`, // ⚙️ uses VITE_API_BASE env var
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("adminToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
