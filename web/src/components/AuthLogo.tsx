import { SITE_NAME } from '../lib/format';

/** Brasão do MNG para as telas de acesso */
export function AuthLogo() {
  return (
    <div className="auth-logo">
      <img src="/mng-logo.png" alt="MNG" width={168} height={168} />
      <span className="auth-brand">{SITE_NAME}</span>
    </div>
  );
}
