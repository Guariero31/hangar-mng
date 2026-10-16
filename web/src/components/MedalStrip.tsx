// Medalhas em tamanho pequeno: vitrine ao lado do nickname e grade compacta (ficha do jogador).
import type { Achievement, MedalLite } from '../api/types';
import { MedalArt } from './MedalArt';

export function MedalStrip({ medals, size = 22 }: { medals: MedalLite[]; size?: number }) {
  if (!medals.length) return null;
  return (
    <span className="medal-strip" aria-label="Medalhas">
      {medals.map((m) => (
        <span key={m.key} title={m.name} style={{ width: size, height: size * 1.32 }}>
          <MedalArt icon={m.icon} rarity={m.rarity} />
        </span>
      ))}
    </span>
  );
}

const fmt = (iso: string) => new Date(iso).toLocaleDateString('pt-BR');

export function MedalGrid({ items }: { items: Achievement[] }) {
  return (
    <ul className="medal-grid">
      {items.map((a) => (
        <li key={a.key} className={a.earnedAt ? 'done' : ''}
          title={a.earnedAt ? `${a.name} — conquistada em ${fmt(a.earnedAt)}` : `${a.name} — ${a.desc} (${a.hint ?? `${a.current}/${a.target}`})`}>
          <MedalArt icon={a.icon} rarity={a.rarity} />
        </li>
      ))}
    </ul>
  );
}
