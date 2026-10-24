import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { apiClient } from "../api/client.js";
import { getSocket } from "../utils/socket.js";

// Leaflet's default marker icons don't resolve correctly under Vite's
// bundler without this explicit override - a well-known Leaflet+bundler quirk.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Distinct amber marker for the technician, so it's visually different
// from the customer's address pin without needing extra icon assets.
const technicianIcon = L.divIcon({
  className: "",
  html: `<div style="width:18px;height:18px;border-radius:50%;background:#ff8a3d;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Small helper component that recenters the map whenever the technician's
// position updates - react-leaflet requires this pattern via useMap().
function RecenterOnMove({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.panTo([position.lat, position.lng]);
  }, [position, map]);
  return null;
}

export default function TrackTechnician() {
  const { token } = useParams();
  const [info, setInfo] = useState(null);
  const [technicianPosition, setTechnicianPosition] = useState(null);
  const [trackingEnded, setTrackingEnded] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const socketRef = useRef(null);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await apiClient.get(`/tracking/${token}`);
        setInfo(data);
        if (data.lastKnownLocation) {
          const loc = data.lastKnownLocation;
          setTechnicianPosition(typeof loc === "string" ? JSON.parse(loc) : loc);
        }
      } catch (err) {
        setError(err.response?.data?.message || "This tracking link isn't valid.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  useEffect(() => {
    if (!info || info.status !== "ON_THE_WAY") return;

    const socket = getSocket();
    socketRef.current = socket;

    socket.emit("join-tracking", { token });

    socket.on("location-update", (data) => setTechnicianPosition(data));
    socket.on("tracking-error", (data) => setError(data.message));
    socket.on("tracking-ended", () => setTrackingEnded(true));

    return () => {
      socket.off("location-update");
      socket.off("tracking-error");
      socket.off("tracking-ended");
    };
  }, [info, token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-ink text-white flex items-center justify-center">
        <p className="text-white/40 text-sm">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-ink text-white flex items-center justify-center px-6 text-center">
        <div>
          <p className="text-red-300 text-sm mb-4">{error}</p>
          <Link to="/" className="text-brand-cool hover:underline text-sm">
            ← ServiceBook home
          </Link>
        </div>
      </div>
    );
  }

  const distanceKm = technicianPosition
    ? haversineKm(technicianPosition.lat, technicianPosition.lng, info.customerLat, info.customerLng)
    : null;

  return (
    <div className="min-h-screen bg-ink text-white">
      <header className="flex justify-between items-center px-5 sm:px-6 py-4 border-b border-white/10">
        <span className="font-display font-bold text-lg">ServiceBook</span>
      </header>

      <main className="px-5 sm:px-6 py-8 max-w-2xl mx-auto">
        <h1 className="font-display text-xl font-semibold mb-1">{info.serviceName}</h1>
        <p className="text-white/55 text-sm mb-6">
          {trackingEnded
            ? "Your technician has arrived."
            : info.technicianName
            ? `${info.technicianName} is on the way`
            : "Waiting for your technician's location..."}
        </p>

        {trackingEnded ? (
          <div className="rounded-2xl border border-brand-cool/30 bg-brand-cool/10 p-8 text-center">
            <div className="text-2xl mb-2">✓</div>
            <p className="text-sm text-white/70">Live tracking has ended - your technician has arrived.</p>
          </div>
        ) : (
          <>
            <div className="rounded-2xl overflow-hidden border border-white/10 mb-4" style={{ height: 360 }}>
              <MapContainer
                center={[info.customerLat, info.customerLng]}
                zoom={13}
                style={{ height: "100%", width: "100%" }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap contributors'
                />
                <Marker position={[info.customerLat, info.customerLng]}>
                  <Popup>Your address</Popup>
                </Marker>
                {technicianPosition && (
                  <>
                    <Marker
                      position={[technicianPosition.lat, technicianPosition.lng]}
                      icon={technicianIcon}
                    >
                      <Popup>{info.technicianName || "Technician"}</Popup>
                    </Marker>
                    <RecenterOnMove position={technicianPosition} />
                  </>
                )}
              </MapContainer>
            </div>

            {distanceKm !== null && (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-center">
                <span className="font-mono text-brand-accent text-lg font-semibold">
                  {distanceKm.toFixed(1)} km
                </span>
                <span className="text-white/45 text-sm ml-2">away from you</span>
              </div>
            )}

            {!technicianPosition && (
              <p className="text-white/40 text-xs text-center mt-4">
                Waiting for the first location update - this can take a few seconds.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}