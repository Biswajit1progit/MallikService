import { createContext, useContext, useState, useEffect } from "react";
import { apiClient, setAccessToken } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // On app load, try to silently restore the session via the refresh cookie.
  // If it fails, the person just sees the login page - no error needed.
  useEffect(() => {
    async function restoreSession() {
      try {
        const { data } = await apiClient.post("/auth/refresh");
        setAccessToken(data.accessToken);
        const me = await apiClient.get("/auth/me");
        setUser(me.data.user);
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, []);

  function loginSuccess({ user: loggedInUser, accessToken }) {
    setAccessToken(accessToken);
    setUser(loggedInUser);
  }
  function updateUser(next) {
  setUser(next);
}
  async function logout() {
    try {
      await apiClient.post("/auth/logout");
    } finally {
      setAccessToken(null);
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, loginSuccess, updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}