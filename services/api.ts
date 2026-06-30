import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, 
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
  baseURL: import.meta.env.ODOO_API_URL, 
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

export const odooApi = axios.create({
  baseURL: "/api",       
  withCredentials: true, 
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "X-SSO-API-KEY": "my-sso-secret-123",
  },
});

odooApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err.message;
    return Promise.reject(new Error(msg));
  }
);
