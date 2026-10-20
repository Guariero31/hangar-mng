import { InfoTip } from './InfoTip';

/** Explicação de como o "PM médio por missão" é calculado. Usada na árvore e no painel de admin. */
export function AverageInfo({ personal = false }: { personal?: boolean }) {
  return (
    <InfoTip label="Como funciona o PM médio por missão" title="PM médio por missão">
      {personal
        ? <p>É a <b>sua média de PM por missão</b>. Cada piloto tem a sua, calculada sozinha com o seu histórico.</p>
        : <p>É a <b>média de PM que os pilotos fizeram por missão</b>. O sistema calcula sozinho, e ninguém digita esse valor.</p>}
      <ul>
        <li>{personal ? 'Soma o PM que você recebeu' : 'Soma o PM lançado para cada piloto'} nas missões <b>encerradas</b> (pelo relatório ou pelo encerramento) e divide pelo número de {personal ? 'missões em que você participou' : 'participações'}.</li>
        <li>{personal ? 'Participar e fazer 0 PM entra na conta. Missões agendadas e missões em que você se inscreveu mas não participou ficam de fora.' : 'Quem participou e fez 0 PM entra na conta. Missões ainda agendadas e inscritos que não participaram ficam de fora.'}</li>
        <li>Os bônus de sobrevivência e da aeronave já estão dentro do PM recebido.</li>
      </ul>
      <p>{personal ? 'A árvore usa a sua média para estimar quantas missões faltam para cada aeronave. Até você participar da primeira missão encerrada, não há média e a estimativa não aparece.' : 'No painel de admin ela mostra o ritmo geral do esquadrão. Enquanto nenhuma missão tiver sido encerrada, não há média.'}</p>
    </InfoTip>
  );
}
