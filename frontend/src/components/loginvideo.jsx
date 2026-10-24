import { useEffect, useMemo, useRef } from "react";

/**
 * LoginVideo – plays the Mallik Service intro once on a TRANSPARENT background
 * (so the panel colour shows through) and holds the last frame.
 *
 * Files in /public:
 *   mallik-login.webm           transparent video (Chrome, Edge, Firefox, Android)
 *   mallik-login-fallback.mp4   same video on the panel colour (Safari / iPhone / iPad)
 *
 * Size: by default the video stretches to the full width of the AuthLayout left panel
 * (the negative margins cancel the panel's p-7 / md:p-12 padding), so no edge is visible.
 */

// must match the padding of the <aside> in AuthLayout (p-7 md:p-12)
const FULL_BLEED = "-mx-7 -mt-7 md:-mx-12 md:-mt-12";

// Soft-fades the 4 edges of the fallback MP4 so its flat-colour box can't be seen
const FADE_X = "linear-gradient(to right, transparent 0, #000 4%, #000 96%, transparent 100%)";
const FADE_Y = "linear-gradient(to bottom, transparent 0, #000 6%, #000 94%, transparent 100%)";
const FALLBACK_MASK = {
  WebkitMaskImage: `${FADE_X}, ${FADE_Y}`,
  maskImage: `${FADE_X}, ${FADE_Y}`,
  WebkitMaskComposite: "source-in",
  maskComposite: "intersect",
};

export default function LoginVideo({
  webm = "/mallik-login.webm",
  fallback = "/mallik-login-fallback.mp4",
  className = FULL_BLEED,
}) {
  const ref = useRef(null);

  // Safari and every iOS browser can't render WebM transparency -> use the baked MP4
  const isFallback = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent;
    const isIOS =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
    return isIOS || isSafari;
  }, []);

  const src = isFallback ? fallback : webm;

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true; // required for autoplay

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      v.pause();
      const toEnd = () => { v.currentTime = v.duration; };
      if (v.readyState >= 1) toEnd();
      else v.addEventListener("loadedmetadata", toEnd, { once: true });
      return;
    }
    v.play().catch(() => {});
  }, [src]);

  return (
    <div className={className} style={isFallback ? FALLBACK_MASK : undefined}>
      <video
        key={src}
        ref={ref}
        className="block w-full h-auto"
        src={src}
        muted
        playsInline
        autoPlay
        preload="auto"
        aria-label="Mallik Service intro animation"
      />
    </div>
  );
}