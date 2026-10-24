export default function TechnicianIllustration({ className = "" }) {
  return (
    <svg
      viewBox="0 0 420 420"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Soft glow backdrop */}
      <circle cx="210" cy="210" r="190" fill="url(#glowGrad)" opacity="0.5" />

      {/* AC unit on wall */}
      <rect x="230" y="90" width="150" height="62" rx="12" fill="#0f3548" stroke="#3fd6c0" strokeWidth="2" />
      <rect x="246" y="106" width="118" height="6" rx="3" fill="#3fd6c0" opacity="0.7" />
      <rect x="246" y="120" width="118" height="6" rx="3" fill="#3fd6c0" opacity="0.5" />
      <rect x="246" y="134" width="80" height="6" rx="3" fill="#3fd6c0" opacity="0.35" />
      <circle cx="352" cy="120" r="8" fill="#ff8a3d" />

      {/* Cool air lines from AC */}
      <path d="M240 158 Q230 175 240 192" stroke="#3fd6c0" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      <path d="M262 158 Q252 178 262 198" stroke="#3fd6c0" strokeWidth="2.5" strokeLinecap="round" opacity="0.45" />
      <path d="M284 158 Q274 175 284 192" stroke="#3fd6c0" strokeWidth="2.5" strokeLinecap="round" opacity="0.3" />

      {/* Ladder */}
      <path d="M150 380 L190 160" stroke="#5c7480" strokeWidth="6" strokeLinecap="round" />
      <path d="M210 380 L250 170" stroke="#5c7480" strokeWidth="6" strokeLinecap="round" />
      <path d="M158 350 L221 340" stroke="#5c7480" strokeWidth="5" strokeLinecap="round" />
      <path d="M166 310 L228 300" stroke="#5c7480" strokeWidth="5" strokeLinecap="round" />
      <path d="M174 270 L236 261" stroke="#5c7480" strokeWidth="5" strokeLinecap="round" />
      <path d="M182 230 L243 222" stroke="#5c7480" strokeWidth="5" strokeLinecap="round" />

      {/* Technician body */}
      <g>
        {/* Legs */}
        <rect x="188" y="290" width="16" height="70" rx="8" fill="#0e2f42" />
        <rect x="214" y="290" width="16" height="70" rx="8" fill="#0e2f42" />
        {/* Boots */}
        <rect x="182" y="356" width="26" height="12" rx="6" fill="#10242f" />
        <rect x="208" y="356" width="26" height="12" rx="6" fill="#10242f" />

        {/* Torso - jumpsuit */}
        <rect x="178" y="220" width="66" height="80" rx="14" fill="#16394f" />
        <rect x="178" y="220" width="66" height="18" rx="9" fill="#ff8a3d" />

        {/* Arms */}
        <rect x="150" y="228" width="16" height="60" rx="8" fill="#16394f" transform="rotate(-18 150 228)" />
        <rect x="252" y="230" width="16" height="55" rx="8" fill="#16394f" transform="rotate(35 252 230)" />

        {/* Hand holding wrench, reaching to AC */}
        <circle cx="272" cy="188" r="9" fill="#e8c9a8" />
        <rect x="266" y="160" width="8" height="34" rx="4" fill="#5c7480" transform="rotate(28 270 177)" />

        {/* Head */}
        <circle cx="211" cy="200" r="20" fill="#e8c9a8" />
        {/* Hard hat */}
        <path d="M188 196 Q211 172 234 196 Z" fill="#ff8a3d" />
        <rect x="186" y="194" width="50" height="7" rx="3.5" fill="#f07a2a" />
      </g>

      {/* Toolbox on the ground */}
      <rect x="270" y="340" width="60" height="34" rx="6" fill="#0f3548" stroke="#3fd6c0" strokeWidth="1.5" />
      <rect x="288" y="330" width="24" height="12" rx="4" fill="#0f3548" stroke="#3fd6c0" strokeWidth="1.5" />
      <rect x="278" y="352" width="44" height="4" rx="2" fill="#3fd6c0" opacity="0.5" />

      <defs>
        <radialGradient id="glowGrad" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#3fd6c0" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#3fd6c0" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}