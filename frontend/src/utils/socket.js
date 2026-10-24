import { io } from "socket.io-client";

let socket = null;

// One shared connection reused across the app instead of opening a new
// socket every time a component mounts.
export function getSocket() {
  if (!socket) {
    const backendUrl = import.meta.env.VITE_API_URL.replace("/api", "");
    socket = io(backendUrl, { autoConnect: true });
  }
  return socket;
}