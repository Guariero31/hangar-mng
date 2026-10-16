// Arte das medalhas: medalhão metálico (bronze, prata ou ouro) com relevo, brilho especular e coroa de louros,
// pendurado numa fita. Tudo em SVG, sem imagens externas.
import { useId } from 'react';

type Rarity = 'common' | 'rare' | 'legendary';

const METAL: Record<Rarity, { hi: string; mid: string; lo: string; deep: string; ribbon: string; ribbon2: string; tint: string }> = {
  common:    { hi: '#f3d3a8', mid: '#b7773e', lo: '#5a2f12', deep: '#1f1008', ribbon: '#3f6a2c', ribbon2: '#233b1a', tint: '#ffd2a0' },
  rare:      { hi: '#ffffff', mid: '#b4bdca', lo: '#566071', deep: '#12161d', ribbon: '#2368b8', ribbon2: '#133e70', tint: '#cfe0ff' },
  legendary: { hi: '#fff6bd', mid: '#f2b01e', lo: '#8f5200', deep: '#241600', ribbon: '#b8281f', ribbon2: '#751410', tint: '#ffe27a' },
};

/** Emblemas desenhados em volta do centro (0,0), cabem num quadrado de ±19 */
function Emblem({ icon, c }: { icon: string; c: string }) {
  const s = { fill: 'none', stroke: c, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  const f = { fill: c, stroke: 'none' } as const;
  switch (icon) {
    case 'wing': { // asas de piloto: escudo central e cinco penas de cada lado
      const feathers = [0, 1, 2, 3, 4].map((i) => {
        const y = -9 + i * 4.3, len = 19 - i * 2.4;
        return `M3 ${y}L${3 + len} ${y - 3.4 + i * 0.5}L${3 + len - 1.6} ${y + 1.1 + i * 0.2}L3 ${y + 3.6}z`;
      });
      return <g>
        <g>{feathers.map((d, i) => <path key={i} {...f} d={d} stroke="#000" strokeOpacity=".45" strokeWidth=".5" />)}</g>
        <g transform="scale(-1 1)">{feathers.map((d, i) => <path key={i} {...f} d={d} stroke="#000" strokeOpacity=".45" strokeWidth=".5" />)}</g>
        <path {...f} d="M-4.6 -11h9.2v8.5c0 4.2-4.6 7.5-4.6 7.5s-4.6-3.300-4.600-7.500z" stroke="#000" strokeOpacity=".5" strokeWidth=".6" />
        <path d="M0 -8.6l1.5 3.100 3.400.5-2.500 2.400.6 3.400L0 -.9l-3 1.500.6-3.400-2.500-2.400 3.400-.5z" fill="#000" opacity=".5" />
      </g>;
    }
    case 'hangar':
      return <g>
        <path {...f} d="M-19 16V-2L0-17 19-2V16h-7V4H-12v12z" />
        <path {...f} d="M-9 16V6h18v10z" opacity=".75" />
        <path {...s} stroke="#000" strokeWidth={1} opacity=".5" d="M-9 9h18M-9 12.5h18" />
      </g>;
    case 'coin':
      return <g><circle {...s} r="16" /><circle {...s} strokeWidth={1.2} r="12" /><text x="0" y="5" textAnchor="middle" fontSize="13" fontWeight="800" fontFamily="Oxanium, sans-serif" fill={c}>PM</text></g>;
    case 'target':
      return <g><circle {...s} r="16" /><circle {...s} r="9" /><circle {...f} r="3.2" /><path {...s} strokeWidth={1.8} d="M0-19v8M0 11v8M-19 0h8M11 0h8" /></g>;
    case 'tier':
      return <g><path {...s} d="M0-17 17-8 0 1-17-8z" /><path {...s} d="M-17 1 0 10 17 1M-17 9 0 18 17 9" /></g>;
    case 'heli':
      return <g><path {...s} d="M-18-14h36M0-14v6" /><ellipse {...f} cx="-2" cy="2" rx="12" ry="8" /><path {...s} d="M10 0l10-4M-14 10h16M-6 10v-3M2 10v-3" /><path {...s} stroke="#000" strokeWidth={1.5} d="M-9-1a6 5 0 0 1 8-2" /></g>;
    case 'fighter':
      return <g><path {...f} d="M0-19 3-8l15 12v4L3 4l-1 9 5 4v2H-7v-2l5-4-1-9-15 4V4L-3-8z" transform="scale(.98)" /></g>;
    case 'link':
      return <g><rect {...s} x="-18" y="-8" width="20" height="16" rx="8" transform="rotate(-35)" /><rect {...s} x="-2" y="-8" width="20" height="16" rx="8" transform="rotate(-35)" /></g>;
    case 'fleet':
      return <g><text x="0" y="8" textAnchor="middle" fontSize="26" fontWeight="800" fontFamily="Oxanium, sans-serif" fill={c}>15</text><path {...s} strokeWidth={2} d="M-14-14 0-19l14 5M-10 15h20" /></g>;
    case 'star':
      return <g><path {...f} d="M0-19 5-6l14 1L8 4l4 14-12-8-12 8 4-14L-19-5l14-1z" /><text x="0" y="6" textAnchor="middle" fontSize="12" fontWeight="800" fontFamily="Oxanium, sans-serif" fill="#000">IV</text></g>;
    case 'crown':
      return <g><path {...f} d="M-18 12 -20-10-9 0 0-14 9 0 20-10 18 12z" /><path {...s} stroke="#000" strokeWidth={1.4} d="M-16 7h32" /><circle cx="0" cy="-14" r="2" {...f} /></g>;
    case 'shield':
      return <g><path {...s} d="M0-18 16-12v11C16 8 9 14 0 18-9 14-16 8-16-1v-11z" /><path {...s} strokeWidth={2} d="M-7-2 0 4 7-2M-7 4 0 10 7 4" /></g>;
    default:
      return <circle {...f} r="6" />;
  }
}

const rad = (d: number) => (d * Math.PI) / 180;

function SvgMedal({ icon, rarity, className }: { icon: string; rarity: Rarity; className?: string }) {
  const id = useId().replace(/:/g, '');
  const m = METAL[rarity];
  const U = (n: string) => `url(#${n}${id})`;
  const R = rarity === 'legendary' ? 27 : rarity === 'rare' ? 29 : 32; // raio do disco central
  const CY = 85;

  // folhas de louro: dois anéis defasados (legendária) ou um anel (rara)
  const leaf = 'M0 0C3.4-2.6 5.6-7.6 0-13.5-5.6-7.6-3.4-2.6 0 0z';
  const rings = rarity === 'legendary'
    ? [{ n: 28, r: 32.5, tilt: 38, s: .84, off: 0 }, { n: 28, r: 30.5, tilt: -22, s: .66, off: 6.4 }]
    : rarity === 'rare' ? [{ n: 24, r: 31.5, tilt: 36, s: .8, off: 0 }] : [];
  const leaves = rings.flatMap((g, gi) => Array.from({ length: g.n }, (_, i) => {
    const a = (i / g.n) * 360 + g.off;
    return <g key={`${gi}-${i}`} transform={`rotate(${a}) translate(0 ${-g.r}) rotate(${90 - g.tilt}) scale(${g.s})`}>
      <path d={leaf} fill={U('m')} stroke={m.lo} strokeWidth=".5" />
      <path d="M0 -.5V-11" stroke={m.lo} strokeWidth=".55" opacity=".7" />
    </g>;
  }));
  // contas (bronze) ou orbes (ouro) na borda
  const beads = rarity === 'common'
    ? null
    : rarity === 'legendary'
      ? Array.from({ length: 14 }, (_, i) => <circle key={i} cx={Math.cos(rad(i * (360 / 14) + 4)) * 40} cy={Math.sin(rad(i * (360 / 14) + 4)) * 40} r="1.8" fill={U('o')} stroke={m.lo} strokeWidth=".4" />)
      : null;
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = rad(i * 6), r1 = R - 2.4, r2 = R - 0.6;
    return <path key={i} d={`M${Math.cos(a) * r1} ${Math.sin(a) * r1}L${Math.cos(a) * r2} ${Math.sin(a) * r2}`} />;
  });

  return (
    <svg className={className} viewBox="0 0 100 132" role="img" aria-hidden="true">
      <defs>
        <linearGradient id={`m${id}`} x1=".1" y1="0" x2=".9" y2="1">
          <stop offset="0" stopColor={m.hi} /><stop offset=".28" stopColor={m.mid} /><stop offset=".5" stopColor={m.hi} stopOpacity=".92" />
          <stop offset=".72" stopColor={m.mid} /><stop offset="1" stopColor={m.lo} />
        </linearGradient>
        <linearGradient id={`r${id}`} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor={m.lo} /><stop offset=".45" stopColor={m.mid} /><stop offset="1" stopColor={m.hi} />
        </linearGradient>
        <radialGradient id={`o${id}`} cx=".35" cy=".3" r=".8"><stop offset="0" stopColor={m.hi} /><stop offset=".6" stopColor={m.mid} /><stop offset="1" stopColor={m.lo} /></radialGradient>
        <radialGradient id={`d${id}`} cx=".32" cy=".28" r=".95">
          <stop offset="0" stopColor={m.mid} stopOpacity=".95" /><stop offset=".55" stopColor={m.lo} /><stop offset="1" stopColor={m.deep} />
        </radialGradient>
        <linearGradient id={`f${id}`} x1="0" x2="1">
          <stop offset="0" stopColor={m.ribbon2} /><stop offset=".5" stopColor={m.ribbon} /><stop offset="1" stopColor={m.ribbon2} />
        </linearGradient>
        {/* relevo: luz vinda de cima e da esquerda, brilho especular e sombra projetada */}
        <filter id={`e${id}`} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceAlpha" stdDeviation=".7" result="b" />
          <feSpecularLighting in="b" surfaceScale="3.2" specularConstant="1.1" specularExponent="18" lightingColor={m.tint} result="s">
            <feDistantLight azimuth="225" elevation="46" />
          </feSpecularLighting>
          <feComposite in="s" in2="SourceAlpha" operator="in" result="hl" />
          <feOffset in="SourceAlpha" dx=".7" dy="1.1" result="o" />
          <feGaussianBlur in="o" stdDeviation=".7" result="ob" />
          <feFlood floodColor="#000" floodOpacity=".65" /><feComposite in2="ob" operator="in" result="sh" />
          <feMerge><feMergeNode in="sh" /><feMergeNode in="SourceGraphic" /><feMergeNode in="hl" /></feMerge>
        </filter>
        {/* textura de metal escovado */}
        <filter id={`t${id}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="3" seed="4" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 -.18" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
        {/* tecido da fita: malha de microfuros em losango + trama fina, como fita militar */}
        <pattern id={`w${id}`} width="2.2" height="2.2" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="2.2" height="2.2" fill="none" />
          <circle cx=".55" cy=".55" r=".42" fill="#000" opacity=".55" />
          <circle cx="1.65" cy="1.65" r=".42" fill="#000" opacity=".55" />
          <circle cx="1.65" cy=".55" r=".22" fill="#fff" opacity=".22" />
          <circle cx=".55" cy="1.65" r=".22" fill="#fff" opacity=".22" />
        </pattern>
        <pattern id={`h${id}`} width="4" height="1.5" patternUnits="userSpaceOnUse">
          <rect width="4" height=".5" fill="#fff" opacity=".07" /><rect y=".9" width="4" height=".4" fill="#000" opacity=".12" />
        </pattern>
        <linearGradient id={`s${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".5" /><stop offset=".28" stopColor="#fff" stopOpacity=".16" />
          <stop offset=".55" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" />
        </linearGradient>
        <clipPath id={`c${id}`}><circle r={R} /></clipPath>
      </defs>

      {/* fita */}
      {['M26 0h18l11 48H33z', 'M56 0h18L67 48H45z'].map((d, i) => (
        <g key={i}>
          <path d={d} fill={U('f')} />
          <path d={d} fill={U('h')} />
          <path d={d} fill={U('w')} />
          <path d={d} fill={U('s')} />
          <path d={d} fill="none" stroke={m.hi} strokeWidth=".7" opacity=".45" />
        </g>
      ))}
      <path d="M46 0h8l-3 40z" fill="#000" opacity=".3" />

      <g transform={`translate(50 ${CY})`}>
        <ellipse cx="2" cy="4" rx="43" ry="41" fill="#000" opacity=".4" />
        {/* louros / contas */}
        <g filter={U('e')}>{leaves}{beads}</g>
        {/* aro externo */}
        <g filter={U('e')}>
          <circle r={R + 3.4} fill={U('m')} stroke={m.lo} strokeWidth=".8" />
        </g>
        {rarity === 'common' && <circle r={R + 2.7} fill="none" stroke="#000" strokeWidth="1.6" strokeDasharray=".55 .95" opacity=".55" />}
        <circle r={R + 1.4} fill={U('r')} />
        <circle r={R + 1.4} fill="none" stroke={m.hi} strokeWidth=".6" opacity=".7" />
        {/* campo do disco */}
        <circle r={R} fill={U('d')} />
        <g clipPath={U('c')}>
          <circle r={R} fill="#fff" filter={U('t')} opacity=".22" />
          <path d="M-40-40 40 40H-40z" fill={m.hi} opacity=".05" />
        </g>
        <g stroke={m.hi} strokeWidth=".45" opacity=".55">{ticks}</g>
        <circle r={R - 3} fill="none" stroke={m.hi} strokeWidth=".7" opacity=".5" />
        <circle r={R - 3.8} fill="none" stroke="#000" strokeWidth=".6" opacity=".45" />
        {/* emblema em relevo */}
        <g filter={U('e')}><g transform="scale(1.12)"><Emblem icon={icon} c={U('m')} /></g></g>
        {/* reflexo */}
        <path d={`M${-R + 3} -6A${R - 3} ${R - 3} 0 0 1 -6 ${-R + 3}`} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".38" />
      </g>

      {/* argola */}
      <g filter={U('e')}><ellipse cx="50" cy="46" rx="7.5" ry="4.8" fill="none" stroke={U('m')} strokeWidth="2.8" /></g>
    </svg>
  );
}

// Medalhas ilustradas (PNG transparente em /medalhas); ícones sem imagem caem no desenho em SVG.
const IMG: Record<string, string> = {
  wing: 'first_flight', hangar: 'full_hangar5', coin: 'saver', target: 'goal_done', tier: 'tier2_complete', heli: 'heli_ace',
  fighter: 'hunter', link: 'perfect_pair', fleet: 'fleet15', star: 'elite_t4', crown: 'full_tier', shield: 'veteran',
};

export function MedalArt({ icon, rarity, className, large = false }: { icon: string; rarity: Rarity; className?: string; large?: boolean }) {
  const f = IMG[icon];
  if (!f) return <SvgMedal icon={icon} rarity={rarity} className={className} />;
  return <img className={className} src={`/medalhas/${large ? 'grandes/' : ''}${f}.png`} alt="" loading={large ? 'eager' : 'lazy'} decoding="async" draggable={false}
    style={{ display: 'block', objectFit: 'contain', ...(className ? {} : { width: '100%', height: '100%' }) }} />;
}
