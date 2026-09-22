import axios from "axios";
import {getWorkspaceOwnerUserId,} from './workspaceContext';

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

api.interceptors.request.use(
  (config) => {
    const workspaceOwnerUserId =
      getWorkspaceOwnerUserId();

    if (workspaceOwnerUserId) {
      config.headers.set(
        'X-Snabbb-Workspace-User-Id',
        workspaceOwnerUserId
      );
    } else {
      config.headers.delete(
        'X-Snabbb-Workspace-User-Id'
      );
    }

    return config;
  }
);

export const creditApi = axios.create({
  baseURL: import.meta.env.VITE_ODOO_API_URL, 
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