import api from "./odooApi";


export const loginOdoo = async (email: string, password: string) => {
  const url = "/web/session/authenticate";
  const db = "aht-systemadmin-mrbur-main-20994444";

  try {
    const response = await api.post(url, {
      "jsonrpc": "2.0",
      "method": "call",
      "params": {
        "db": db,
        "login": email,
        "password": password
      },
      "id": 1
    });

    if (response.data.error) {
      throw new Error(response.data.error.message);
    }
    return response.data; 
  } catch (err: any) {
    throw new Error(err.message || "Odoo login failed");
  }
};
