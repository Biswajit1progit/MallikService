/* import { Navigate } from "react-router-dom";
import { useAuth } from "../context/authcontext.jsx";

export default function ProtectedRoute({ children }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div style={{ padding: 40, color: "var(--ink-muted)" }}>Loading...</div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }
    // Google users without a phone must finish their profile first
  if (user.needsPhone) {
    return <Navigate to="/complete-profile" replace />;
  }
  return children;
} */


  import { Navigate } from "react-router-dom";
import { useAuth } from "../context/authcontext.jsx";
import { homeFor } from "../utils/roleHome.js";

// roles (optional): only these roles may open the page, e.g. roles={["technician"]}.
// Anyone else is sent to their own home page instead of seeing a broken screen.
export default function ProtectedRoute({ children, roles }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div style={{ padding: 40, color: "var(--ink-muted)" }}>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Google users without a phone must finish their profile first
  if (user.needsPhone) {
    return <Navigate to="/complete-profile" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to={homeFor(user)} replace />;
  }

  return children;
}