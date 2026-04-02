import { api } from "./api";

const applink = async (param: any) => {
    try {
        const {data} = await api.post('/v1/sso/app_link', {
                    "jsonrpc": "2.0",
                    "method": "call",
                    "params": {
                      "app_code": "inventory",
                      "email": param.username,
                      "name": param.name,
                      "company_id": 2,
                      "portal": true
                    },
                    "id": 1
                  });
      if(data && data.result.url){
              window.open(data.result.url, "_blank");
            }
    } catch (err: any) {
      console.error("Redirection error:", err);
      throw new Error(err.message || "SSO redirection failed");
    }
}

export default applink;