import { Link } from 'react-router-dom';

const CONTACT = 'donodobarmng@gmail.com';

/** Política de privacidade pública (exigida pelo Google para publicar o login) */
export function Privacy() {
  return (
    <main className="auth">
      <section className="auth-glass privacy">
        <h1 className="auth-title">Política de privacidade</h1>
        <p className="auth-sub">Hangar MNG, sistema do esquadrão MNG para DCS World. Atualizada em 16/10/2026.</p>

        <h2>Quais dados guardamos</h2>
        <ul>
          <li>Pelo login com Google: seu nome, e-mail e foto de perfil. Não recebemos nem guardamos sua senha do Google.</li>
          <li>O nickname que você escolhe no primeiro acesso.</li>
          <li>Dados de uso do jogo: Pontos de Missão, aeronaves desbloqueadas, medalhas, meta e histórico de lançamentos.</li>
          <li>Registros de ações de administradores (quem aprovou, lançou pontos ou alterou algo).</li>
          <li>Um cookie de sessão, necessário para manter você conectado. Não usamos cookies de publicidade nem de rastreamento.</li>
        </ul>

        <h2>Para que usamos</h2>
        <p>Só para o funcionamento do sistema: identificar você, aprovar o cadastro, mostrar seu perfil, ranking e tech tree e manter o histórico de pontos. Não vendemos, não alugamos e não compartilhamos seus dados com terceiros para fins comerciais ou de publicidade.</p>

        <h2>Onde ficam os dados</h2>
        <p>Em um servidor privado do esquadrão, contratado na Hostinger (Brasil), com conexão protegida por HTTPS e cópias de segurança diárias do banco de dados.</p>

        <h2>Quem vê o quê</h2>
        <p>Seu nickname, foto, medalhas, quantidade de aeronaves e total de pontos ganhos aparecem para os outros pilotos aprovados no ranking. O perfil detalhado e o saldo são privados para você e para os administradores. Seu e-mail só é visível para os administradores do esquadrão.</p>

        <h2>Seus direitos</h2>
        <p>Você pode pedir acesso, correção ou exclusão dos seus dados a qualquer momento, conforme a LGPD. Escreva para <a href={`mailto:${CONTACT}`}>{CONTACT}</a>. Ao excluir a conta, removemos seus dados de cadastro, pontos, frota e medalhas. Os eventos de auditoria são preservados sem vínculo com a conta excluída, e os campos estruturados de identificação são removidos. Textos livres escritos por administradores podem exigir revisão para remoção de dados pessoais. Cópias de segurança seguem o prazo de retenção informado pelo esquadrão.</p>

        <h2>Mudanças</h2>
        <p>Se esta política mudar, a data acima será atualizada.</p>

        <p className="auth-foot"><Link to="/login">Voltar ao login</Link></p>
      </section>
    </main>
  );
}
