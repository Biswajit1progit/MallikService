/* import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/authcontext.jsx";
import ProtectedRoute from "./components/protectedRoute.jsx";
import Login from "./pages/login.jsx";
import Signup from "./pages/signup.jsx";
import Home from "./pages/home.jsx";
import Book from "./pages/book.jsx";
import MyBookings from "./pages/MyBookings.jsx";
import AdminDashboard from "./pages/adminDashboard.jsx";
import TrackTechnician from "./pages/TrackTechnician.jsx";
import CompleteProfile from "./pages/CompleteProfile.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/" element={<Home />} />
          <Route path="/track/:token" element={<TrackTechnician />} />
          <Route
            path="/book"
            element={
              <ProtectedRoute>
                <Book />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings"
            element={
              <ProtectedRoute>
                <MyBookings />
              </ProtectedRoute>
            }
          />
           <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

        <Route path="/complete-profile" 
        element={<CompleteProfile />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
} */




  import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/authcontext.jsx";
import ProtectedRoute from "./components/protectedRoute.jsx";
import Login from "./pages/login.jsx";
import Signup from "./pages/signup.jsx";
import Home from "./pages/home.jsx";
import Book from "./pages/book.jsx";
import MyBookings from "./pages/myBookings.jsx";
import AdminDashboard from "./pages/adminDashboard.jsx";
import CompleteProfile from "./pages/CompleteProfile.jsx";
import TrackTechnician from "./pages/TrackTechnician.jsx";
import TechnicianDashboard from "./pages/TechnicianDashboard.jsx";
import Policies from "./pages/Policies.jsx";
import Invoice from "./pages/invoice.jsx";
import MobileNav from "./components/Mobilenav.jsx";
export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/complete-profile" element={<CompleteProfile />} />
          <Route path="/" element={<Home />} />
          <Route path="/track/:token" element={<TrackTechnician />} />
          <Route path="/policies" element={<Policies />} />
          <Route
            path="/book"
            element={
              <ProtectedRoute roles={["customer", "admin"]}>
                <Book />
              </ProtectedRoute>
            }
          />
          <Route
            path="/bookings"
            element={
              <ProtectedRoute roles={["customer", "admin"]}>
                <MyBookings />
              </ProtectedRoute>
            }
          />
           <Route
            path="/invoice/:bookingId/:kind"
            element={
              <ProtectedRoute roles={["customer", "admin"]}>
                <Invoice />
              </ProtectedRoute>
            }
          />

          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={["admin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/technician"
            element={
              <ProtectedRoute roles={["technician"]}>
                <TechnicianDashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
         <MobileNav />
      </AuthProvider>
    </BrowserRouter>
  );
}