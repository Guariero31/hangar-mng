import type { Aircraft, AircraftRole } from '../api/types';

export const ROLE_LABEL: Record<AircraftRole, string> = {
  fighter: 'Fighter',
  multi: 'Multi Role',
  attack: 'Air to Ground',
  aheli: 'Attack Chopper',
  theli: 'Transport Chopper',
  tplane: 'Transport Plane',
};

/** Ícones disponíveis em web/public/aircraft-icons.svg */
export const ICONS = [
  'a10', 'apache', 'c101', 'c130', 'chinook', 'draken', 'esquilo', 'f14', 'f15', 'f15e', 'f16', 'f16_b', 'f4_phantom', 'f5',
  'fa18_hornet', 'fa18e_super_hornet', 'harrier', 'heli_azul', 'heli_leve', 'jato_enflechado', 'jf17', 'ka50', 'l39', 'mi24',
  'mig21', 'mig29', 'mig29_b', 'mirage2000', 'mirage_f1', 'su25', 'su27', 'su34', 'uh1',
  'swept', 'delta', 'straight', 'heli', 'cargo',
];

/** Ícone da aeronave, ou uma silhueta genérica pelo papel */
export function iconOf(a: Pick<Aircraft, 'icon' | 'role'>) {
  if (a.icon) return a.icon;
  if (a.role === 'aheli' || a.role === 'theli') return 'heli';
  if (a.role === 'tplane') return 'cargo';
  return 'swept';
}

export function AircraftIcon({ icon, className }: { icon: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <use href={`/aircraft-icons.svg#i-${icon}`} />
    </svg>
  );
}

export const fmtMult = (n: number) => n.toFixed(2).replace('.', ',') + 'x';
