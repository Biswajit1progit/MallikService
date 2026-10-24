import { useEffect, useRef, useState } from "react";
import { apiClient, getAccessToken, setAccessToken } from "../api/client.js";
import { getSocket } from "./socket.js";

// Shares the phone's GPS position for ONE booking over the socket so the customer's
// tracking page moves. Also refreshes the access token every 10 minutes: tokens last
// 15 minutes and a trip can take longer, and the socket checks the token on every push.
export function useLocationSharing(onError) {
  const [sharingId, setSharingId] = useState(null);
  const watchRef = useRef(null);
  const refreshRef = useRef(null);

  function stop() {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (refreshRef.current !== null) {
      clearInterval(refreshRef.current);
      refreshRef.current = null;
    }
    setSharingId(null);
  }

  function start(bookingId) {
    if (!navigator.geolocation) {
      onError?.("This phone doesn't support location sharing.");
      return;
    }
    stop();
    const socket = getSocket();
    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        socket.emit("update-location", {
          bookingId,
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accessToken: getAccessToken(),
        });
      },
      (err) => {
        onError?.(
          err.code === 1
            ? "Location is blocked. Allow location for this site in your browser settings."
            : `Couldn't read your location: ${err.message}`
        );
        stop();
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    setSharingId(bookingId);
    refreshRef.current = setInterval(async () => {
      try {
        const { data } = await apiClient.post("/auth/refresh");
        setAccessToken(data.accessToken);
      } catch {
        /* if refresh fails the session is gone; pushes will simply stop being accepted */
      }
    }, 10 * 60 * 1000);
  }

  useEffect(() => stop, []); // stop when the page is left
  return { sharingId, start, stop };
}