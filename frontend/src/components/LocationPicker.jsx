import { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Default view: Odisha (service area). Used until the user searches/locates.
const DEFAULT_CENTER = [20.77, 85.52];

function FlyTo({ position }) {
  const map = useMap();
  useEffect(() => {
    if (position) map.flyTo(position, Math.max(map.getZoom(), 16), { duration: 0.8 });
  }, [position, map]);
  return null;
}

function ClickToPin({ onPick }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

// Nominatim (OpenStreetMap) - free, no key. Usage policy: max ~1 req/sec,
// so searches are debounced and only fire for 3+ characters.
async function reverseGeocode(lat, lng) {
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`
    );
    const d = await r.json();
    return d.display_name || "";
  } catch {
    return "";
  }
}

// props: value = { lat, lng } | null ; onChange({ lat, lng, addressText? })
export default function LocationPicker({ value, onChange }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const [flyTarget, setFlyTarget] = useState(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=in&limit=5&q=${encodeURIComponent(query)}`
        );
        setResults(await r.json());
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 600);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  async function setPoint(lat, lng, knownText, fly = true) {
    const pos = [lat, lng];
    if (fly) setFlyTarget(pos);
    onChange({ lat, lng, addressText: knownText ?? undefined });
    if (!knownText) {
      const text = await reverseGeocode(lat, lng);
      if (text) onChange({ lat, lng, addressText: text });
    }
  }

  function pickResult(r) {
    setResults([]);
    setQuery("");
    setPoint(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
  }

  function useMyLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Your browser doesn't support location access.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setPoint(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        setError("Couldn't get your location. Search or tap the map instead.");
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  }

  const position = value ? [value.lat, value.lng] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your area, landmark or street..."
          className="w-full rounded-lg bg-white/5 border border-white/10 px-3.5 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-brand-cool transition-colors"
        />
        {(searching || results.length > 0) && (
          <ul className="absolute z-[1000] left-0 right-0 mt-1 rounded-lg border border-white/10 bg-[#0f1d29] shadow-xl overflow-hidden">
            {searching && <li className="px-3.5 py-2.5 text-xs text-white/40">Searching...</li>}
            {results.map((r) => (
              <li key={r.place_id}>
                <button
                  type="button"
                  onClick={() => pickResult(r)}
                  className="w-full text-left px-3.5 py-2.5 text-sm text-white/80 hover:bg-white/10 border-t border-white/5"
                >
                  {r.display_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl overflow-hidden border border-white/10 h-64 sm:h-80 relative z-0">
        <MapContainer
          center={position || DEFAULT_CENTER}
          zoom={position ? 16 : 9}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPin onPick={(lat, lng) => setPoint(lat, lng, undefined, false)} />
          <FlyTo position={flyTarget} />
          {position && (
            <Marker
              position={position}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  setPoint(lat, lng, undefined, false);
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="text-xs text-white/40">
        Tap the map or drag the pin to your exact doorstep. On a laptop, "current location" can be
        several km off - if the pin looks wrong, just drag it to the right place.
      </p>

      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="self-start text-sm font-semibold text-brand-cool hover:underline disabled:opacity-50"
      >
        {locating ? "Locating..." : "📍 Use my current location"}
      </button>
      {error && <p className="text-xs text-red-300">{error}</p>}
    </div>
  );
}