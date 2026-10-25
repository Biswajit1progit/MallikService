
// "Mallik Service" wordmark: same colours as the logo under the technician (orange Mallik,
// soft white Service). Use it anywhere the site name is shown: <BrandName />.
export default function BrandName({ className = "" }) {
  return (
    <span className={`font-display font-extrabold tracking-tight whitespace-nowrap ${className}`}>
      <span className="text-[#ff8a3d]">Mallik</span>
      <span className="text-[#eaf6f4] font-semibold ml-[0.25em]">Service</span>
    </span>
  );
}