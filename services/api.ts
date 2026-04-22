import axios from "axios";
import { env } from "process";

export const api = axios.create({
  baseURL: env.VITE_API_BASE_URL, 
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Optional: basic error unwrap
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err.message;
    return Promise.reject(new Error(msg));
  }
);

export const creditApi = axios.create({
  baseURL: env.ODOO_API_URL, 
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Optional: basic error unwrap
creditApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err.message;
    return Promise.reject(new Error(msg));
  }
);
