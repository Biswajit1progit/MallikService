import { useCallback, useEffect, useRef, useState } from "react";
import "./Mallik.css";


/**
 * MallikHero – code-driven "Mallik Service" mascot animation.
 *
 * Sequence (~6s): mechanic slides in -> brand text reveals -> tools fly out of
 * the toolbox, hover, and return -> thumbs-up bounce. Plays once when it
 * first appears on screen.
 *
 * Props:
 *  - line1, line2 (string)  brand text lines. default "Mallik" / "Service"
 *  - loop         (bool)    replay automatically. default false
 *  - className    (string)  extra class on the wrapper
 *
 * Needs: src/assets/mallik-mechanic.png
 */

// All positions below are in "cqw" = % of the stage width (stage is 16:10).
const ORIGIN = { x: 40.2, y: 47 }; // toolbox opening

const TOOLS = [
  { key: "wrench",      hover: { x: 57, y: 11.5 }, tilt: 36,  spin: 320,  delay: 0,   phase: 0.0 },
  { key: "pliers",      hover: { x: 70.5, y: 9.5 }, tilt: -14, spin: -340, delay: 180, phase: 1.6 },
  { key: "screwdriver", hover: { x: 83.5, y: 12 }, tilt: 28,  spin: 300,  delay: 360, phase: 3.1 },
];

const TOOLS_START = 1500; // ms
const TOOL_DURATION = 3600; // ms per tool (out + hover + return)

const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
const quad = (p0, c, p1, t) => ({
  x: (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * c.x + t * t * p1.x,
  y: (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * c.y + t * t * p1.y,
});

function buildToolFrames(tool) {
  const N = 80;
  const H = tool.hover;
  const up = { x: lerp(ORIGIN.x, H.x, 0.45), y: Math.min(ORIGIN.y, H.y) - 16 };
  const down = { x: lerp(ORIGIN.x, H.x, 0.7), y: Math.min(ORIGIN.y, H.y) - 6 };
  const frames = [];

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    let p, rot, scale, opacity;

    if (t < 0.25) {
      const u = t / 0.25;
      const e = smooth(u);
      p = quad(ORIGIN, up, H, e);
      rot = tool.tilt - tool.spin * (1 - outCubic(u));
      scale = 0.35 + 0.65 * outCubic(u);
      opacity = Math.min(1, u * 8);
    } else if (t < 0.72) {
      const u = (t - 0.25) / 0.47;
      const w = u * Math.PI * 2;
      p = {
        x: H.x + Math.sin(w + tool.phase) * 0.6,
        y: H.y + Math.sin(w * 2 + tool.phase) * 0.9,
      };
      rot = tool.tilt + Math.sin(w * 2 + tool.phase) * 5;
      scale = 1;
      opacity = 1;
    } else {
      const u = (t - 0.72) / 0.28;
      const e = smooth(u);
      p = quad(H, down, ORIGIN, e);
      rot = tool.tilt - tool.spin * 0.55 * e;
      scale = 1 - 0.65 * e;
      opacity = u > 0.85 ? 1 - (u - 0.85) / 0.15 : 1;
    }

    frames.push({
      offset: t,
      opacity,
      transform: `translate(${p.x.toFixed(2)}cqw, ${p.y.toFixed(2)}cqw) translate(-50%, -50%) rotate(${rot.toFixed(1)}deg) scale(${scale.toFixed(3)})`,
    });
  }
  return frames;
}

const canAnimate = () =>
  typeof window !== "undefined" &&
  typeof Element !== "undefined" &&
  typeof Element.prototype.animate === "function" &&
  typeof CSS !== "undefined" &&
  CSS.supports("width", "1cqw");

export default function MallikHero({
  line1 = "Mallik",
  line2 = "Service",
  loop = false,
  className = "",
}) {
  const stageRef = useRef(null);
  const animsRef = useRef([]);
  const timerRef = useRef(null);
  const playedRef = useRef(false);
  const [isStatic, setIsStatic] = useState(false);

  // Static final frame for "reduce motion" users or very old browsers
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setIsStatic(mq.matches || !canAnimate());
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const stop = useCallback(() => {
    clearTimeout(timerRef.current);
    animsRef.current.forEach((a) => a.cancel());
    animsRef.current = [];
  }, []);

  const play = useCallback(() => {
    const root = stageRef.current;
    if (!root || !canAnimate()) return;
    stop();

    const all = [];
    const opts = (o) => ({ fill: "both", ...o });

    // 1) mechanic slides in
    all.push(
      root.querySelector(".mh-char").animate(
        [
          { opacity: 0, transform: "translateX(-9cqw) scale(0.96)" },
          { opacity: 1, transform: "translateX(0) scale(1)" },
        ],
        opts({ duration: 900, easing: "cubic-bezier(.2,.9,.3,1.1)" })
      )
    );

    // 2) brand text reveals line by line
    root.querySelectorAll(".mh-line > span").forEach((el, i) => {
      all.push(
        el.animate(
          [
            { opacity: 0, transform: "translateY(105%)" },
            { opacity: 1, transform: "translateY(0)" },
          ],
          opts({ duration: 700, delay: 500 + i * 180, easing: "cubic-bezier(.2,.8,.2,1)" })
        )
      );
    });

    // 3) tools fly out, hover, return
    TOOLS.forEach((tool) => {
      const el = root.querySelector(`[data-tool="${tool.key}"]`);
      if (!el) return;
      all.push(
        el.animate(
          buildToolFrames(tool),
          opts({ duration: TOOL_DURATION, delay: TOOLS_START + tool.delay, easing: "linear" })
        )
      );
    });

    // 4) thumbs-up bounce once tools are back in the box
    all.push(
      root.querySelector(".mh-char img").animate(
        [
          { transform: "rotate(0deg) scale(1)" },
          { transform: "rotate(-2.5deg) scale(1.035)", offset: 0.3 },
          { transform: "rotate(1.5deg) scale(1.02)", offset: 0.6 },
          { transform: "rotate(0deg) scale(1)" },
        ],
        opts({ duration: 900, delay: 5300, easing: "ease-in-out" })
      )
    );

    animsRef.current = all;

    Promise.all(all.map((a) => a.finished))
      .then(() => {
        if (loop) timerRef.current = setTimeout(play, 1500);
      })
      .catch(() => {}); // cancelled by a replay
  }, [loop, stop]);

  // Auto-play once when scrolled into view
  useEffect(() => {
    const root = stageRef.current;
    if (!root || isStatic) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !playedRef.current) {
          playedRef.current = true;
          play();
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(root);
    return () => io.disconnect();
  }, [isStatic, play]);

  useEffect(() => stop, [stop]);

  return (
    <div
      ref={stageRef}
      className={`mallik-hero ${isStatic ? "is-static" : ""} ${className}`}
      role="img"
      aria-label={`${line1} ${line2} mechanic mascot animation`}
    >
      <div className="mh-char">
        <img src="./mallik-mechanic.png" alt="" draggable="false" />
      </div>

      <div className="mh-text" aria-hidden="true">
        <span className="mh-line"><span>{line1}</span></span>
        <span className="mh-line"><span>{line2}</span></span>
      </div>

      {/* Wrench */}
      <svg data-tool="wrench" className="mh-tool" style={{ "--h": "14cqw" }} viewBox="0 0 40 100" aria-hidden="true">
        <defs>
          <mask id="mh-wrench-mask">
            <rect width="40" height="100" fill="#fff" />
            <rect x="14.5" y="-2" width="11" height="17" fill="#000" />
          </mask>
        </defs>
        <rect x="14.5" y="30" width="11" height="64" rx="5.5" fill="#d5dae1" stroke="#7a8290" strokeWidth="2" />
        <g mask="url(#mh-wrench-mask)">
          <circle cx="20" cy="19" r="16" fill="#d5dae1" stroke="#7a8290" strokeWidth="2" />
        </g>
        <path d="M14.5 3 V15 H25.5 V3" fill="none" stroke="#7a8290" strokeWidth="2" strokeLinejoin="round" />
        <circle cx="20" cy="86" r="2.6" fill="#8f97a3" />
      </svg>

      {/* Pliers */}
      <svg data-tool="pliers" className="mh-tool" style={{ "--h": "14cqw" }} viewBox="0 0 60 100" aria-hidden="true">
        <path d="M30 44 L14 94" stroke="#8f2f05" strokeWidth="11" strokeLinecap="round" />
        <path d="M30 44 L14 94" stroke="#f26a1b" strokeWidth="8" strokeLinecap="round" />
        <path d="M30 44 L46 94" stroke="#8f2f05" strokeWidth="11" strokeLinecap="round" />
        <path d="M30 44 L46 94" stroke="#f26a1b" strokeWidth="8" strokeLinecap="round" />
        <path d="M30 46 L17 24 Q14 9 23 4 L31 22 Z" fill="#d5dae1" stroke="#7a8290" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M30 46 L43 24 Q46 9 37 4 L29 22 Z" fill="#d5dae1" stroke="#7a8290" strokeWidth="1.8" strokeLinejoin="round" />
        <circle cx="30" cy="46" r="4.2" fill="#9aa2ae" stroke="#6b7280" strokeWidth="1.5" />
      </svg>

      {/* Screwdriver */}
      <svg data-tool="screwdriver" className="mh-tool" style={{ "--h": "14cqw" }} viewBox="0 0 24 100" aria-hidden="true">
        <rect x="10" y="3" width="4" height="46" rx="1.2" fill="#d5dae1" stroke="#7a8290" strokeWidth="1.5" />
        <rect x="5" y="44" width="14" height="52" rx="6" fill="#f26a1b" stroke="#a63d08" strokeWidth="1.8" />
        <path d="M7 58h10M7 66h10M7 74h10" stroke="#c4500f" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </div>
  );
}