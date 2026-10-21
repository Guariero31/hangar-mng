import { useToast } from '../../components/Toast';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage } from '../../api/client';
import type { ScoringRules } from '../../api/types';
import { Select } from '../../components/Select';
import { fmtPoints } from '../../lib/format';
import { DEFAULT_TIER_BONUSES } from '../../lib/mission-report';
import { AdminTabs } from './AdminTabs';
import './admin.css';
import './scoring.css';

type Target = Exclude<keyof ScoringRules, 'survivalEnabled' | 'survivalMultiplier' | 'tierBonuses'>;
const TARGETS: { key: Target; label: string; description: string; category: 'combat' | 'transport' }[] = [
  { key: 'airborneAircraft', label: 'Aeronave em voo', description: 'Aeronave inimiga abatida no ar.', category: 'combat' },
  { key: 'groundAircraft', label: 'Aeronave no solo', description: 'Aeronave inimiga destruída em solo.', category: 'combat' },
  { key: 'armoredVehicle', label: 'Veículo blindado', description: 'Blindado inimigo destruído.', category: 'combat' },
  { key: 'antiAircraft', label: 'Veículo antiaéreo', description: 'Defesa antiaérea que não se enquadra como SAM.', category: 'combat' },
  { key: 'helicopter', label: 'Helicóptero', description: 'Helicóptero inimigo destruído.', category: 'combat' },
  { key: 'ship', label: 'Navio', description: 'Embarcação inimiga destruída.', category: 'combat' },
  { key: 'sam', label: 'SAM', description: 'Alvo SAM destruído. Não soma também como veículo antiaéreo.', category: 'combat' },
  { key: 'helicopterTransport', label: 'Transporte por helicóptero', description: 'Por objetivo de transporte concluído no ponto designado.', category: 'transport' },
  { key: 'cargoTransport', label: 'Avião de carga', description: 'Por objetivo de transporte concluído no ponto designado.', category: 'transport' },
];

function ScoringForm({ initial }: { initial: ScoringRules }) {
  const toast = useToast();
  const [rules, setRules] = useState(initial);
  const [target, setTarget] = useState<Target>('airborneAircraft');
  const [quantity, setQuantity] = useState(5);
  const [survived, setSurvived] = useState(true);
  const [message, setMessage] = useState('');
  const queryClient = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.put<ScoringRules>('/admin/scoring', rules),
    onSuccess: (saved) => { setRules(saved); queryClient.setQueryData(['admin', 'scoring'], saved); setMessage('Regras de pontuação salvas.'); toast('Regras de pontuação salvas.'); },
  });
  const update = <K extends keyof ScoringRules>(key: K, value: ScoringRules[K]) => { setRules((current) => ({ ...current, [key]: value })); setMessage(''); save.reset(); };
  const subtotal = rules[target] * quantity;
  const multiplier = rules.survivalEnabled && survived ? rules.survivalMultiplier : 1;
  const total = Math.round(subtotal * multiplier);
  return <form onSubmit={(event) => { event.preventDefault(); setMessage(''); save.mutate(); }}>
    <div className="scoring-layout"><fieldset className="scoring-fields" disabled={save.isPending}>
      {(['combat', 'transport'] as const).map((category) => <section key={category} className="card scoring-card">
        <div className="scoring-card-head"><span className="label">{category === 'combat' ? '01 / Combate' : '02 / Logística'}</span><h2>{category === 'combat' ? 'Pontos por alvo' : 'Objetivos de transporte'}</h2><p>{category === 'combat' ? 'Cada alvo destruído entra uma única vez na categoria correspondente.' : 'Pontuação por objetivo concluído, sem depender de abates.'}</p></div>
        <div className="scoring-targets">{TARGETS.filter((item) => item.category === category).map((item) => <label key={item.key} className="scoring-target">
          <span><strong>{item.label}</strong><small>{item.description}</small></span>
          <span className="scoring-value"><input className="input" type="number" min={0} max={1_000_000} step={1} required value={rules[item.key]} aria-label={`Pontos: ${item.label}`} onChange={(event) => update(item.key, Number(event.target.value))} /><span>PM</span></span>
        </label>)}</div>
      </section>)}
      <section className="card scoring-card"><div className="scoring-card-head"><span className="label">03 / Sobrevivência</span><h2>Voltar para casa vale mais</h2><p>Aplica o bônus à soma dos pontos de combate e transporte quando o piloto não for abatido.</p></div>
        <div className="scoring-bonus"><label className="scoring-toggle"><input type="checkbox" checked={rules.survivalEnabled} onChange={(event) => update('survivalEnabled', event.target.checked)} /><span>Ativar bônus de sobrevivência</span></label>
          <label className="field"><span className="label">Multiplicador de sobrevivência</span><span className="scoring-value"><input className="input" type="number" min={1} max={10} step={0.01} required disabled={!rules.survivalEnabled} value={rules.survivalMultiplier} onChange={(event) => update('survivalMultiplier', Number(event.target.value))} /><span>×</span></span></label>
        </div>
      </section>
      <section className="card scoring-card"><div className="scoring-card-head"><span className="label">04 / Aeronave de tier menor</span><h2>Bônus por voar abaixo do tier da missão</h2><p>Quem voa uma aeronave de tier igual ou maior que o da missão recebe 1,0×. Quem voa tiers abaixo recebe o bônus da linha correspondente, somado ao de sobrevivência. Diferenças maiores que a última linha usam o último valor.</p></div>
        <div className="scoring-targets">{rules.tierBonuses.map((bonus, index) => <label key={index} className="scoring-target">
          <span><strong>{index + 1} {index === 0 ? 'tier abaixo' : 'tiers abaixo'}</strong><small>Ex.: aeronave Tier {Math.max(1, 3 - (index + 1))} em missão de Tier 3.</small></span>
          <span className="scoring-value"><input className="input" type="number" min={1} max={3} step={0.01} required value={bonus} aria-label={`Bônus com ${index + 1} tier abaixo`} onChange={(event) => update('tierBonuses', rules.tierBonuses.map((item, i) => i === index ? Number(event.target.value) : item))} /><span>×</span></span>
        </label>)}</div>
        <div className="scoring-card-footer"><button type="button" className="scoring-restore" onClick={() => update('tierBonuses', [...DEFAULT_TIER_BONUSES])}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" /></svg>Restaurar valores padrão</button></div>
      </section>
    </fieldset><aside className="scoring-sidebar">
      <section className="card scoring-simulation"><span className="label">Prévia do cálculo</span><h2>Simule um resultado</h2><p>Usa os valores do formulário. Não lança pontos para nenhum piloto.</p>
        <label className="field"><span className="label">Ação / alvo</span><Select aria-label="Alvo da simulação" value={target} onChange={(value) => setTarget(value as Target)} options={TARGETS.map((item) => ({ value: item.key, label: item.label }))} /></label>
        <label className="field"><span className="label">Quantidade</span><input className="input" type="number" min={0} max={10000} step={1} required value={quantity} onChange={(event) => setQuantity(Math.max(0, Math.min(10000, Math.floor(Number(event.target.value) || 0))))} /></label>
        <label className="scoring-toggle"><input type="checkbox" checked={survived} onChange={(event) => setSurvived(event.target.checked)} /><span>Piloto não foi abatido</span></label>
        <dl className="scoring-breakdown"><div><dt>Subtotal</dt><dd>{fmtPoints(subtotal)} PM</dd></div><div><dt>Multiplicador aplicado</dt><dd>{multiplier.toLocaleString('pt-BR')}×</dd></div></dl>
        <div className="scoring-total"><span>Total da simulação</span><strong>{fmtPoints(total)} <small>PM</small></strong></div><small className="muted">Total arredondado para o inteiro mais próximo.</small>
      </section>
      <section className="scoring-existing"><span className="label">Como os bônus se combinam</span><p>PM = pontos × (1 + bônus da aeronave + bônus de sobrevivência), tudo sobre os pontos base. O tier da missão é escolhido no cadastro dela; missões sem tier não dão bônus de aeronave.</p><p>Esta simulação usa só o bônus de sobrevivência.</p><Link to="/admin/aeronaves">Ver tiers e aeronaves →</Link></section>
    </aside></div>
    <footer className="card scoring-save"><div>{save.error ? <p role="alert" className="op-error">{errorMessage(save.error)}</p> : message ? <p role="status">{message}</p> : <p>Salvar altera os parâmetros. Não modifica saldos nem pontuações já distribuídas.</p>}</div><button className="btn" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar regras de pontuação'}</button></footer>
  </form>;
}

export function ScoringAdmin() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'scoring'], queryFn: () => api.get<ScoringRules>('/admin/scoring') });
  return <div className="scoring-page"><div className="page-head"><div><span className="label">Administração / Regras do esquadrão</span><h1>Pontuação</h1><p>Defina quanto vale cada resultado e configure o bônus de sobrevivência.</p></div></div><AdminTabs />
    <p className="scoring-stage">Estas regras calculam os pontos dos relatórios pós-missão. Relatórios salvos preservam os valores utilizados, mesmo após mudanças futuras.</p>
    {isLoading && <p className="loading">Carregando regras…</p>}
    {error && <div role="alert"><p>{errorMessage(error)}</p><button type="button" className="btn ghost" onClick={() => refetch()}>Tentar novamente</button></div>}
    {data && <ScoringForm initial={data} />}
  </div>;
}
