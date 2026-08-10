// src/hooks/useProfileImage.ts
import { useState, useEffect } from "react";

export function useProfileImage(isLoggedIn: boolean | null) {
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return; // ← only fetch when logged in

    fetch("https://account.snabbb.com/api/account/profile", {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    })
      .then((res) => res.json())
      .catch(() => null)
      .then((data) => {
        if (!data?.ok) return;
        const imageUrl = data.partner.has_image
          ? `https://account.snabbb.com/web/image/res.partner/${data.partner_id}/image_128?unique=${Date.now()}`
          : null;
                setProfileImageUrl(imageUrl);
              });
  }, [isLoggedIn]); // ← re-run when login state changes

  return { profileImageUrl };
}