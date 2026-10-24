import { useEffect, useRef } from "react";
import { apiClient } from "../api/client.js";

// Loads Google Identity Services once and renders their button into our
// own-styled wrapper. On success, sends the id_token to our backend's
// /auth/google endpoint (ID-token verification flow, no redirect needed).
export default function GoogleAuthButton({ onSuccess, onError }) {
  const buttonRef = useRef(null);

  useEffect(() => {
    function initGoogle() {
      if (!window.google || !buttonRef.current) return;

      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: async (response) => {
          try {
            const { data } = await apiClient.post("/auth/google", {
              idToken: response.credential,
            });
            onSuccess(data);
          } catch (err) {
            onError?.(err);
          }
        },
      });

      window.google.accounts.id.renderButton(buttonRef.current, {
        type: "standard",
        theme: "filled_black",
        size: "large",
        shape: "pill",
        width: buttonRef.current.offsetWidth,
      });
    }

    if (window.google) {
      initGoogle();
    } else {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.onload = initGoogle;
      document.body.appendChild(script);
    }
  }, [onSuccess, onError]);

  return <div ref={buttonRef} style={{ width: "100%" }} />;
}