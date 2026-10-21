// Ribbon (PNG enviado pelo admin) com estrelas e "V" desenhados por cima em SVG.
// Regra das estrelas: 1ª condecoração = fita lisa; a cada nova, +1 estrela de bronze;
// 5 de bronze viram 1 de prata.
export function starsFor(count: number) {
  const extra = Math.max(0, count - 1);
  return { silver: Math.floor(extra / 5), bronze: extra % 5 };
}

const star = (cx: number, cy: number, r: number) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.42 : r;
    return `${(cx + rad * Math.cos(a)).toFixed(1)},${(cy + rad * Math.sin(a)).toFixed(1)}`;
  });
  return pts.join(' ');
};

export function RibbonImage({ id, version, count = 1, valor = false, width = 220, name }: { id: string; version: number; count?: number; valor?: boolean; width?: number; name: string }) {
  const { silver, bronze } = starsFor(count);
  const symbols = [...Array(silver).fill('#dfe3ea'), ...Array(bronze).fill('#c9863f')];
  const gap = 30, start = 165 - ((symbols.length - 1) * gap) / 2;
  return (
    <div className="ribbon-img" style={{ width, aspectRatio: '330 / 90' }}>
      <img src={`/api/ribbons/${id}/image?v=${version}`} alt={name} width={width} loading="lazy" />
      <svg viewBox="0 0 330 90" aria-hidden="true" focusable="false">
        {symbols.map((fill, i) => <polygon key={i} points={star(start + i * gap, 45, 12)} fill={fill} stroke="#000" strokeOpacity=".55" strokeWidth="1.2" />)}
        {valor && <text x="300" y="22" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="22" fill="#e8c14b" stroke="#000" strokeOpacity=".6" strokeWidth=".8" textAnchor="middle">V</text>}
      </svg>
    </div>
  );
}
