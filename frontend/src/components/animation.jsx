// Mallik Service hero: the technician catches a big adjustable spanner that travels round a
// circular arrow and lands in his hand, then the cycle repeats. The "Mallik Service" name sits
// under him.
//
// Pure SVG + CSS (no images, no libraries). The spanner's round trip is generated below as
// plain CSS keyframes, so it works the same on every phone and browser. Phones that ask for
// "reduced motion" get a calm still picture: spanner already in his hand.
//
// One loop = 7s.  0-4% waiting | 4-36% spanner travels round the arrow | 36% caught
// | 36-84% held | 84-92% put away | then it starts again.

const CX = 196; // centre of the circular arrow; its left edge is exactly where his hand is
const CY = 84;
const R = 46;

const rad = (d) => (d * Math.PI) / 180;
const f = (n) => Math.round(n * 100) / 100;

// Spanner keyframes: follow the circle clockwise from the top (-90deg) to the left (180deg),
// turning so its head always leads. At 180deg it is upright, exactly the way he holds it.
function spannerKeyframes() {
  const N = 20;
  const steps = [];
  for (let i = 0; i <= N; i += 1) {
    const u = i / N;
    const e = 0.5 - 0.5 * Math.cos(Math.PI * u); // ease in-out along the path
    const a = -90 + 270 * e;
    const x = CX + R * Math.cos(rad(a)) - 150;
    const y = CY + R * Math.sin(rad(a)) - 84;
    const pct = 4 + 32 * u;
    steps.push(`${f(pct)}%{opacity:1;transform:translate(${f(x)}px,${f(y)}px) rotate(${f(a + 180)}deg) scale(1)}`);
  }
  const sx = CX + R * Math.cos(rad(-90)) - 150;
  const sy = CY + R * Math.sin(rad(-90)) - 84;
  return (
    `0%{opacity:0;transform:translate(${f(sx)}px,${f(sy)}px) rotate(90deg) scale(.5)}` +
    steps.join("") +
    `38%{opacity:1;transform:translate(0,0) rotate(360deg) scale(1.1)}` +
    `42%{transform:translate(0,0) rotate(360deg) scale(.98)}` +
    `58%{transform:translate(0,-1px) rotate(360deg) scale(1)}` +
    `66%{transform:translate(0,-2px) rotate(355deg) scale(1)}` +
    `76%{transform:translate(0,-1px) rotate(364deg) scale(1)}` +
    `84%{opacity:1;transform:translate(0,0) rotate(360deg) scale(1)}` +
    `92%,100%{opacity:0;transform:translate(-26px,18px) rotate(360deg) scale(.6)}`
  );
}

// Arrowhead at the end of the circular arrow (pointing into his hand)
function arrowHead() {
  const a = 150;
  const px = CX + R * Math.cos(rad(a));
  const py = CY + R * Math.sin(rad(a));
  const tx = -Math.sin(rad(a));
  const ty = Math.cos(rad(a)); // direction of travel
  const nx = -ty;
  const ny = tx;
  const tip = [px + tx * 15, py + ty * 15];
  const b1 = [px + nx * 7, py + ny * 7];
  const b2 = [px - nx * 7, py - ny * 7];
  return `M${f(tip[0])} ${f(tip[1])} L${f(b1[0])} ${f(b1[1])} L${f(b2[0])} ${f(b2[1])} Z`;
}

const ARC_START = [CX + R * Math.cos(rad(-100)), CY + R * Math.sin(rad(-100))];
const ARC_END = [CX + R * Math.cos(rad(150)), CY + R * Math.sin(rad(150))];
const ARC = `M${f(ARC_START[0])} ${f(ARC_START[1])} A${R} ${R} 0 1 1 ${f(ARC_END[0])} ${f(ARC_END[1])}`;

const CSS = `
  .mk-fing{transform-box:fill-box;transform-origin:left center;transform:scaleX(.42)}
  .mk-thumb{transform-box:fill-box;transform-origin:left center;transform:rotate(3deg)}
  .mk-trail,.mk-burst{opacity:0}
  .mk-nod{transform-origin:71px 42px}
  .mk-mouth-calm{opacity:0}
  .mk-arc{stroke-dasharray:100;stroke-dashoffset:0}
  .mk-head{opacity:1}
  @media (prefers-reduced-motion:no-preference){
    .mk-wrench{opacity:0;animation:mk-fly 7s infinite both}
    .mk-trail{animation:mk-trail 7s infinite both}
    .mk-burst{animation:mk-burst 7s infinite both}
    .mk-fing{transform:scaleX(1);animation:mk-grip 7s infinite both}
    .mk-thumb{transform:rotate(-28deg);animation:mk-thumb 7s infinite both}
    .mk-nod{animation:mk-nod 7s ease-in-out infinite both}
    .mk-mouth-calm{opacity:1;animation:mk-calm 7s infinite both}
    .mk-mouth-smile{opacity:0;animation:mk-smile 7s infinite both}
    .mk-arm{animation:mk-bob 7s ease-in-out infinite both}
    .mk-glow{animation:mk-glow 7s ease-in-out infinite both}
    .mk-arc{stroke-dashoffset:100;animation:mk-draw 7s infinite both}
    .mk-ring{animation:mk-ring 7s infinite both}
    .mk-head{animation:mk-head 7s infinite both}
  }
  @keyframes mk-fly{${spannerKeyframes()}}
  @keyframes mk-trail{0%,6%{opacity:0}10%{opacity:.9}32%{opacity:.5}37%,100%{opacity:0}}
  @keyframes mk-burst{0%,35%{opacity:0;transform:scale(.2)}37.5%{opacity:1;transform:scale(1)}45%,100%{opacity:0;transform:scale(1.7)}}
  @keyframes mk-grip{0%,32%{transform:scaleX(1)}38%{transform:scaleX(.42)}42%,84%{transform:scaleX(.5)}90%,100%{transform:scaleX(1)}}
  @keyframes mk-thumb{0%,32%{transform:rotate(-28deg)}38%{transform:rotate(4deg)}42%,84%{transform:rotate(0deg)}90%,100%{transform:rotate(-28deg)}}
  @keyframes mk-nod{0%,34%,56%,100%{transform:rotate(0) translateY(0)}38%{transform:rotate(5deg) translateY(2px)}42%{transform:rotate(-2deg) translateY(0)}46%{transform:rotate(4deg) translateY(1.6px)}50%{transform:rotate(0) translateY(0)}}
  @keyframes mk-smile{0%,34%{opacity:0}38%,84%{opacity:1}90%,100%{opacity:0}}
  @keyframes mk-calm{0%,34%{opacity:1}38%,84%{opacity:0}90%,100%{opacity:1}}
  @keyframes mk-bob{0%,34%,46%,100%{transform:translateY(0)}38%{transform:translateY(2.4px)}}
  @keyframes mk-glow{0%,30%,100%{opacity:.3}38%{opacity:.9}60%{opacity:.5}}
  @keyframes mk-draw{0%,4%{stroke-dashoffset:100}36%,100%{stroke-dashoffset:0}}
  @keyframes mk-ring{0%{opacity:0}4%,84%{opacity:1}92%,100%{opacity:0}}
  @keyframes mk-head{0%,6%{opacity:0}12%,36%{opacity:1}42%,100%{opacity:0}}
`;

// The big adjustable spanner. (0,0) is the middle of the handle, where his fist closes.
function Spanner() {
  return (
    <g>
      {/* handle */}
      <rect x="-4.6" y="-14" width="9.2" height="50" rx="4.6" fill="#c7d3d9" />
      <rect x="-1.2" y="-12" width="2.6" height="46" rx="1.3" fill="#eef4f7" opacity="0.8" />
      <circle cx="0" cy="31" r="2.2" fill="#6b808c" />
      {/* head: open-end jaws, with the adjusting wheel on the side */}
      <path
        d="M-12 -36 a6 6 0 0 1 6 -6 h3 v17 h6 v-17 h3 a6 6 0 0 1 6 6 v24 a6 6 0 0 1 -6 6 h-12 a6 6 0 0 1 -6 -6 z"
        fill="#c7d3d9"
      />
      <path d="M-12 -36 a6 6 0 0 1 6 -6 h3 v17 h-9 z" fill="#fff" opacity="0.28" />
      <circle cx="12.5" cy="-18" r="5.2" fill="#8fa5b1" stroke="#6b808c" strokeWidth="1" />
      <g stroke="#5f7683" strokeWidth="1">
        <line x1="9" y1="-21" x2="16" y2="-15" />
        <line x1="8.6" y1="-17" x2="14" y2="-22.6" />
      </g>
    </g>
  );
}

export default function ToolCatchAnimation({ className = "" }) {
  return (
    <svg
      viewBox="0 0 310 206"
      className={className}
      role="img"
      aria-label="Mallik Service: a technician catching his spanner"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>{CSS}</style>

      <defs>
        <radialGradient id="mkGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#3fd6c0" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#3fd6c0" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="mkLine" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="#ff8a3d" stopOpacity="0" />
          <stop offset="50%" stopColor="#ff8a3d" />
          <stop offset="100%" stopColor="#ff8a3d" stopOpacity="0" />
        </linearGradient>
      </defs>

      <g transform="translate(52 0)">
      {/* soft glow around the catching hand */}
      <circle className="mk-glow" cx="150" cy="84" r="50" fill="url(#mkGlow)" opacity="0.4" />

      {/* the circular arrow the spanner travels on */}
      <g className="mk-ring">
        <path className="mk-arc" d={ARC} pathLength="100" stroke="#3fd6c0" strokeWidth="3.4" strokeLinecap="round" opacity="0.85" />
      </g>

      {/* ---- his gear, left of him ---- */}
      {/* split AC unit on the wall */}
      <g>
        <rect x="-48" y="6" width="62" height="22" rx="6" fill="#0f3548" stroke="#3fd6c0" strokeWidth="1.4" />
        <rect x="-40" y="14" width="46" height="3" rx="1.5" fill="#3fd6c0" opacity="0.6" />
        <rect x="-40" y="20" width="46" height="3" rx="1.5" fill="#3fd6c0" opacity="0.4" />
        <circle cx="8" cy="12" r="2" fill="#ff8a3d" />
      </g>
      {/* ladder */}
      <g stroke="#7d94a1" strokeLinecap="round">
        <line x1="-44" y1="148" x2="-31" y2="40" strokeWidth="3.4" />
        <line x1="-24" y1="148" x2="-11" y2="40" strokeWidth="3.4" />
        {[132, 116, 100, 84, 68, 52].map((y, i) => {
          const t = (148 - y) / 108;
          const l = -44 + 13 * t;
          return <line key={y} x1={l} y1={y} x2={l + 20} y2={y} strokeWidth="2.6" opacity={0.9 - i * 0.02} />;
        })}
      </g>
      {/* tool bag with a hammer and screwdriver sticking out */}
      <g>
        <rect x="11" y="126" width="32" height="21" rx="5" fill="#0f3548" stroke="#3fd6c0" strokeWidth="1.4" />
        <rect x="11" y="133" width="32" height="4" fill="#ff8a3d" opacity="0.9" />
        <path d="M19 127 q8 -11 16 0" stroke="#7d94a1" strokeWidth="2.6" strokeLinecap="round" fill="none" />
        <rect x="22" y="116" width="3.2" height="12" rx="1.6" fill="#ff8a3d" transform="rotate(-12 23 128)" />
        <rect x="19" y="113" width="10" height="4.4" rx="1.6" fill="#b8cad3" transform="rotate(-12 23 128)" />
        <rect x="31" y="117" width="2.6" height="11" rx="1.3" fill="#b8cad3" transform="rotate(10 32 128)" />
      </g>
      <ellipse cx="71" cy="148" rx="42" ry="3.6" fill="#000" opacity="0.28" />

      {/* ---- technician (behind the tools) ---- */}
      <g>
        {/* far arm, resting at his side */}
        <rect x="44" y="50" width="9.5" height="44" rx="4.7" fill="#0f2b3d" />
        <circle cx="48.8" cy="97" r="5.2" fill="#b07446" />
        {/* legs + boots */}
        <rect x="55" y="94" width="14" height="48" rx="6" fill="#1b2b36" />
        <rect x="73" y="94" width="14" height="48" rx="6" fill="#1b2b36" />
        <rect x="55" y="104" width="2.2" height="36" fill="#ff8a3d" opacity="0.75" />
        <rect x="84.8" y="104" width="2.2" height="36" fill="#ff8a3d" opacity="0.75" />
        <path d="M51 139 h20 a4.5 4.5 0 0 1 4.5 4.5 v2.5 h-24.5 z" fill="#2a1f1a" />
        <path d="M70 139 h20 a4.5 4.5 0 0 1 4.5 4.5 v2.5 h-24.5 z" fill="#2a1f1a" />
        <rect x="51" y="145.4" width="24.5" height="2.6" rx="1.3" fill="#5a4a40" />
        <rect x="70" y="145.4" width="24.5" height="2.6" rx="1.3" fill="#5a4a40" />
        {/* work shirt in the shop colours */}
        <path d="M51 54 Q51 46 60 46 H82 Q91 46 91 54 V98 H51 Z" fill="#16394f" />
        <path d="M51 54 Q51 46 60 46 H66 L60 58 H51 Z" fill="#ff8a3d" />
        <path d="M91 54 Q91 46 82 46 H76 L82 58 H91 Z" fill="#ff8a3d" />
        <rect x="51" y="86" width="40" height="5" fill="#ff8a3d" />
        <rect x="51" y="92" width="40" height="1.6" fill="#e9f1f4" opacity="0.85" />
        <path d="M63 46 L71 56 L79 46" stroke="#ffb27a" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
        {/* shop name printed on the chest */}
        <text x="67.5" y="67.5" textAnchor="middle" fontFamily="'Space Grotesk', system-ui, sans-serif" fontSize="6.6" fontWeight="800" fill="#fff" letterSpacing="0.3">MALLIK</text>
        <text x="67.5" y="75.4" textAnchor="middle" fontFamily="'Space Grotesk', system-ui, sans-serif" fontSize="4.8" fontWeight="700" fill="#3fd6c0" letterSpacing="1.3">SERVICE</text>
        {/* belt, buckle and tool pouch */}
        <rect x="51" y="96" width="40" height="6.4" fill="#2a1f1a" />
        <rect x="66" y="95.6" width="10" height="7.2" rx="1.6" fill="#d9b25a" />
        <rect x="79" y="98" width="11" height="14" rx="3" fill="#2a4a5e" stroke="#10242f" strokeWidth="1" />
        <rect x="81.6" y="94" width="2.6" height="9" rx="1.3" fill="#ff8a3d" />
        {/* neck */}
        <rect x="65.6" y="38" width="11.8" height="11" rx="4" fill="#b07446" />

        {/* ---- head (nods + smiles when he catches the spanner) ---- */}
        <g className="mk-nod">
          <circle cx="58.4" cy="28" r="3.7" fill="#b87d52" />
          <ellipse cx="71.5" cy="26" rx="12.8" ry="14.6" fill="#c68b5e" />
          {/* short black hair at the sides, under the cap */}
          <path d="M58.8 21 Q57.6 30 60.6 33 L61.4 23.6 Z" fill="#1d1612" />
          <path d="M84.2 21 Q85.6 30 82.6 33 L81.8 23.6 Z" fill="#1d1612" />
          {/* eyes (looking toward the hand) and brows */}
          <ellipse cx="66.2" cy="27" rx="2.5" ry="2.7" fill="#fff" />
          <ellipse cx="77" cy="27" rx="2.5" ry="2.7" fill="#fff" />
          <circle cx="67" cy="27.3" r="1.5" fill="#1d1612" />
          <circle cx="77.8" cy="27.3" r="1.5" fill="#1d1612" />
          <path d="M62.6 22.6 q3.6 -2.2 7.2 -0.2" stroke="#1d1612" strokeWidth="1.9" strokeLinecap="round" fill="none" />
          <path d="M73.4 22.4 q3.6 -2 7.2 0.2" stroke="#1d1612" strokeWidth="1.9" strokeLinecap="round" fill="none" />
          <path d="M71.8 28.4 q2.6 3.8 0.2 4.8" stroke="#9c6540" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          {/* short beard and moustache */}
          <path d="M59.4 30 Q59.6 41.6 71.5 43 Q83.4 41.6 83.6 30 Q80 38.4 71.5 39.2 Q63 38.4 59.4 30 Z" fill="#241a15" />
          <path d="M64 34.2 Q67.6 31.8 71.5 33.6 Q75.4 31.8 79 34.2 Q75 36.6 71.5 35.4 Q67.8 36.6 64 34.2 Z" fill="#1d1612" />
          {/* mouth: calm, and a big smile with teeth while he holds the spanner */}
          <path className="mk-mouth-calm" d="M67.4 38 Q71.5 40.2 75.6 38" stroke="#8a4b3a" strokeWidth="1.7" strokeLinecap="round" fill="none" />
          <g className="mk-mouth-smile">
            <path d="M65.6 36.8 Q71.5 44.6 77.4 36.8 Z" fill="#5a1f1f" />
            <path d="M66.8 37.2 H76.2 Q75 39.6 71.5 40 Q68 39.6 66.8 37.2 Z" fill="#fff" />
          </g>
          {/* orange cap with a visor and a teal M badge */}
          <path d="M57 21 Q57 5.6 72 5.6 Q86 5.6 86 21 Z" fill="#ff8a3d" />
          <rect x="57" y="19.4" width="29" height="3.2" fill="#f07a2a" />
          <path d="M80 17.4 Q95 16.6 98 22 Q90 24.6 80 22.6 Z" fill="#f07a2a" />
          <circle cx="72" cy="13.4" r="4" fill="#0f3548" />
          <path d="M69.6 15.6 v-4.4 l2.4 2.8 l2.4 -2.8 v4.4" stroke="#3fd6c0" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>

        {/* near arm: shoulder -> elbow -> wrist, orange cuff, palm */}
        <g className="mk-arm">
          <path d="M85 56 L106 74 L135 83" stroke="#16394f" strokeWidth="12.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M85 56 L106 74" stroke="#1d4a64" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
          <g transform="translate(140 84) rotate(-8)">
            <rect x="-9" y="-7.6" width="7" height="15.2" rx="2.4" fill="#ff8a3d" />
            <rect x="-3" y="-8.4" width="19" height="16.8" rx="6" fill="#c68b5e" />
            <rect x="-3" y="2" width="19" height="6.4" rx="3.2" fill="#b07446" opacity="0.55" />
          </g>
        </g>
      </g>

      {/* ---- the spanner ---- */}
      <g transform="translate(150 84)">
        <g className="mk-wrench">
          <g className="mk-trail">
            <circle cx="-4" cy="44" r="2.4" fill="#ff8a3d" />
            <circle cx="5" cy="53" r="1.8" fill="#ffb27a" />
            <circle cx="-2" cy="62" r="1.3" fill="#3fd6c0" />
            <path d="M8 40 l1.6 -4 l1.6 4 l4 1.6 l-4 1.6 l-1.6 4 l-1.6 -4 l-4 -1.6z" fill="#ffd9b8" opacity="0.9" />
          </g>
          <Spanner />
        </g>
      </g>

      {/* catch burst */}
      <g transform="translate(150 84)">
        <g className="mk-burst">
          {[0, 60, 120, 180, 240, 300].map((a, k) => (
            <line key={a} x1="0" y1="-14" x2="0" y2="-23" stroke={k % 2 ? "#3fd6c0" : "#ff8a3d"} strokeWidth="2.4" strokeLinecap="round" transform={`rotate(${a})`} />
          ))}
          <path d="M0 -9 l2.4 6.6 l6.6 2.4 l-6.6 2.4 l-2.4 6.6 l-2.4 -6.6 l-6.6 -2.4 l6.6 -2.4z" fill="#ffd9b8" transform="scale(.8)" />
        </g>
      </g>

      {/* ---- fingers, in front of the tool: they close around it on the catch ---- */}
      <g className="mk-arm">
        <g transform="translate(140 84) rotate(-8)">
          <rect className="mk-fing" x="14" y="-8.4" width="11" height="4.2" rx="2.1" fill="#c68b5e" stroke="#9c6540" strokeWidth="0.6" />
          <rect className="mk-fing" x="14" y="-4" width="12.5" height="4.2" rx="2.1" fill="#c68b5e" stroke="#9c6540" strokeWidth="0.6" />
          <rect className="mk-fing" x="14" y="0.4" width="11.5" height="4.2" rx="2.1" fill="#c68b5e" stroke="#9c6540" strokeWidth="0.6" />
          <rect className="mk-fing" x="14" y="4.8" width="9" height="3.8" rx="1.9" fill="#c68b5e" stroke="#9c6540" strokeWidth="0.6" />
          <rect className="mk-thumb" x="2" y="-10.6" width="11.5" height="5" rx="2.5" fill="#c68b5e" stroke="#9c6540" strokeWidth="0.6" />
        </g>
      </g>

      {/* arrowhead: on top, so it stays visible beside the hand */}
      <path className="mk-head" d={arrowHead()} fill="#ff8a3d" stroke="#0b1620" strokeWidth="1" strokeLinejoin="round" />

      </g>

      {/* ---- name ---- */}
      <text x="155" y="184" textAnchor="middle" fontFamily="'Space Grotesk', system-ui, sans-serif" fontSize="35" fontWeight="800" letterSpacing="0.5">
        <tspan fill="#ff8a3d">Mallik</tspan>
        <tspan fill="#eaf6f4" dx="9" fontWeight="600">Service</tspan>
      </text>
      <rect x="67" y="193" width="176" height="2.6" rx="1.3" fill="url(#mkLine)" />
    </svg>
  );
}