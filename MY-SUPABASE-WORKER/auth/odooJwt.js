export function parseJwtPayload(token) {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("Invalid JWT");
  
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  
    return JSON.parse(jsonPayload);
  }
  
  export function extractEmail(payload) {
    return payload.email || payload.login || payload.user_email;
  }
  