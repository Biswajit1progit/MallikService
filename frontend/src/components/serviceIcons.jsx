const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconSnowflake({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11" />
      <path d="M12 2l2 2M12 2l-2 2M12 22l2-2M12 22l-2-2" />
      <path d="M4.5 6.5l2.8-.3M4.5 6.5l.3 2.8M19.5 6.5l-2.8-.3M19.5 6.5l-.3 2.8" />
      <path d="M4.5 17.5l2.8.3M4.5 17.5l.3-2.8M19.5 17.5l-2.8.3M19.5 17.5l-.3-2.8" />
    </svg>
  );
}

export function IconWrench({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.8 2.8-2-2 2.8-2.8Z" />
    </svg>
  );
}

export function IconGauge({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <path d="M4 15a8 8 0 1 1 16 0" />
      <path d="M12 15l4-5" />
      <path d="M12 15a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z" />
    </svg>
  );
}

export function IconTools({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      <rect x="3" y="10" width="18" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}