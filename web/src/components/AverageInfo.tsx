import { InfoTip } from './InfoTip';

/** Explicação de como o "PM médio por missão" é calculado. Usada na árvore e no painel de admin. */
export function AverageInfo() {
  return (
    <InfoTip label="Como funciona o PM médio por missão" title="PM médio por missão">
      <p>É a <b>média de PM que os pilotos fizeram por missão</b>. O sistema calcula sozinho, e ninguém digita esse valor.</p>
      <ul>
        <li>Soma o PM lançado para cada piloto nas missões <b>encerradas</b> (pelo relatório ou pelo encerramento) e divide pelo número de participações.</li>
        <li>Quem participou e fez 0 PM entra na conta. Missões ainda agendadas e inscritos que não participaram ficam de fora.</li>
        <li>O bônus de sobrevivência já está dentro do PM lançado. Multiplicadores de tier não entram.</li>
      </ul>
      <p>A árvore usa esse valor para estimar quantas missões faltam para cada aeronave. Enquanto nenhuma missão tiver sido encerrada, não há média e a estimativa não aparece.</p>
    </InfoTip>
  );
}
