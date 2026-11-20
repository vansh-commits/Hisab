import { useId } from "react";
import { useInView } from "./landing-mocks";

// Gold line-art jewellery, drawn stroke by stroke. Every shape has pathLength=1 so one CSS
// animation (.art-draw) draws them all. draw: undefined = static, false = hidden, true = drawing.

export type Jewel = "necklace" | "ring" | "bangles" | "jhumka";

type P = { kind: Jewel; draw?: boolean; className?: string };

const L = { pathLength: 1 } as const;

// cubic bezier point, for beads along a chain
function bez(t: number, p: [number, number][]) {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [0, 1].map((a) => k.reduce((s, c, i) => s + c * p[i]![a]!, 0)) as [number, number];
}

const drop = (x: number, y: number, h: number) => `M${x} ${y} C${x - h * 0.45} ${y + h * 0.55} ${x - h * 0.3} ${y + h} ${x} ${y + h} C${x + h * 0.3} ${y + h} ${x + h * 0.45} ${y + h * 0.55} ${x} ${y} Z`;
const star = (x: number, y: number, s: number) => `M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s} Z`;

function Necklace() {
  const outer: [number, number][] = [[28, 34], [40, 128], [160, 128], [172, 34]];
  const inner: [number, number][] = [[44, 34], [54, 104], [146, 104], [156, 34]];
  return (
    <>
      <path {...L} d="M28 34 C40 128 160 128 172 34" />
      <path {...L} d="M44 34 C54 104 146 104 156 34" />
      {Array.from({ length: 15 }, (_, i) => bez(0.08 + i * 0.06, inner)).map(([x, y], i) => <circle key={i} {...L} cx={x} cy={y} r={2.2} />)}
      {[0.22, 0.34, 0.66, 0.78].map((t) => { const [x, y] = bez(t, outer); return <path key={t} {...L} d={drop(x, y + 2, 13)} />; })}
      <circle {...L} cx={100} cy={106} r={3.5} />
      <path {...L} d={drop(100, 110, 48)} />
      <path {...L} d="M100 126 L109 139 L100 152 L91 139 Z" />
      <path {...L} d="M91 139 L109 139 M100 126 L100 152" />
    </>
  );
}

function Ring() {
  return (
    <>
      <ellipse {...L} cx={100} cy={142} rx={46} ry={46} />
      <ellipse {...L} cx={100} cy={142} rx={37} ry={37} />
      <path {...L} d="M80 46 L120 46 L134 60 L100 96 L66 60 Z" />
      <path {...L} d="M66 60 L134 60 M80 46 L90 60 L100 46 L110 60 L120 46 M90 60 L100 96 L110 60" />
      <path {...L} d="M88 97 L80 62 M112 97 L120 62" />
    </>
  );
}

function Bangles() {
  return (
    <>
      {[78, 102, 126].map((cy) => (
        <g key={cy}>
          <ellipse {...L} cx={100} cy={cy} rx={66} ry={22} />
          <ellipse {...L} cx={100} cy={cy} rx={58} ry={17} />
        </g>
      ))}
      {Array.from({ length: 11 }, (_, i) => -0.9 + i * 0.18).map((a) => (
        <circle key={a} {...L} cx={100 + 62 * Math.sin(a)} cy={102 + 19.5 * Math.cos(a)} r={1.8} />
      ))}
    </>
  );
}

function Jhumka() {
  const pearls = Array.from({ length: 9 }, (_, i) => [60 + i * 10, i % 2 ? 150 : 160] as const);
  return (
    <>
      <path {...L} d="M100 30 C88 28 86 8 100 6 C112 5 114 20 106 24" />
      <circle {...L} cx={100} cy={44} r={8} />
      {Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4).map((a) => <circle key={a} {...L} cx={100 + 13 * Math.cos(a)} cy={44 + 13 * Math.sin(a)} r={3.6} />)}
      <circle {...L} cx={100} cy={64} r={2.5} />
      <path {...L} d="M100 66.5 L100 84" />
      <path {...L} d="M58 136 C58 66 142 66 142 136" />
      <path {...L} d="M72 133 C72 86 128 86 128 133" />
      <path {...L} d="M86 129 C86 104 114 104 114 129" />
      <path {...L} d="M54 136 Q59 144 64 136 Q69 144 74 136 Q79 144 84 136 Q89 144 94 136 Q99 144 104 136 Q109 144 114 136 Q119 144 124 136 Q129 144 134 136 Q139 144 146 136" />
      {pearls.map(([x, y]) => <g key={x}><path {...L} d={`M${x} 141 L${x} ${y - 4}`} /><circle {...L} cx={x} cy={y} r={3.4} /></g>)}
      <path {...L} d={drop(100, 112, 13)} />
    </>
  );
}

const ART = { necklace: Necklace, ring: Ring, bangles: Bangles, jhumka: Jhumka };
const SPARKS: Record<Jewel, [number, number, number][]> = {
  necklace: [[30, 150, 6], [172, 92, 5], [150, 168, 4]],
  ring: [[42, 50, 6], [160, 40, 5], [158, 170, 4]],
  bangles: [[34, 40, 5], [172, 52, 6], [160, 160, 4]],
  jhumka: [[46, 60, 5], [156, 44, 6], [154, 168, 4]],
};

export function JewelArt({ kind, draw, className = "" }: P) {
  const id = useId();
  const Art = ART[kind];
  const state = draw === undefined ? "" : draw ? "art-draw" : "art-hidden";
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden className={`art ${state} ${className}`}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f3dc9a" />
          <stop offset=".5" stopColor="#c9a44c" />
          <stop offset="1" stopColor="#9a7b2f" />
        </linearGradient>
      </defs>
      <g className="strokes" stroke={`url(#${id})`} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"><Art /></g>
      <g fill={`url(#${id})`}>
        {SPARKS[kind].map(([x, y, s], i) => <path key={i} className="twinkle" style={{ animationDelay: `${i * 0.7}s` }} d={star(x, y, s)} />)}
      </g>
    </svg>
  );
}

// Draws itself the first time it scrolls into view. className positions/sizes the wrapper.
export function InViewArt({ kind, className = "" }: Omit<P, "draw">) {
  const [ref, seen] = useInView<HTMLDivElement>(0.3);
  return <div ref={ref} aria-hidden className={className}><JewelArt kind={kind} draw={seen} className="size-full" /></div>;
}

// Thin gold divider: line — diamond — line.
export function Ornament({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 16" className={`mx-auto h-4 w-60 text-gold-400 ${className}`} aria-hidden fill="none" stroke="currentColor" strokeWidth={1}>
      <path d="M0 8 H96 M144 8 H240" />
      <path d="M120 1 L128 8 L120 15 L112 8 Z" fill="currentColor" fillOpacity={0.25} />
      <circle cx={104} cy={8} r={1.6} fill="currentColor" />
      <circle cx={136} cy={8} r={1.6} fill="currentColor" />
    </svg>
  );
}
