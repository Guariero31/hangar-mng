// Erros de negócio: cada um tem um código, um status HTTP e uma mensagem em português.
const CATALOG = {
  NOT_AUTHENTICATED:        [401, 'Faça login para continuar.'],
  BANNED:                   [403, 'Sua conta está suspensa. Fale com um administrador.'],
  PENDING_APPROVAL:         [403, 'Seu cadastro está aguardando aprovação de um administrador.'],
  REJECTED:                 [403, 'Seu cadastro não foi aprovado. Fale com um administrador.'],
  FORBIDDEN:                [403, 'Você não tem permissão para isso.'],
  NICKNAME_REQUIRED:        [403, 'Escolha um nickname antes de continuar.'],
  VALIDATION:               [400, 'Dados inválidos.'],
  GOOGLE_INVALID:           [401, 'Não foi possível validar o login com Google.'],
  GOOGLE_NOT_CONFIGURED:    [400, 'O login com Google não está configurado no servidor.'],
  DEV_LOGIN_DISABLED:       [403, 'Login de desenvolvimento desativado.'],
  NICKNAME_INVALID:         [400, 'Use de 3 a 16 caracteres: letras, números ou _.'],
  NICKNAME_UNCHANGED:       [400, 'O novo nickname é igual ao atual.'],
  NICKNAME_RESERVED:        [400, 'Esse nickname é reservado.'],
  NICKNAME_TAKEN:           [409, 'Esse nickname já está em uso.'],
  NICKNAME_ALREADY_SET:     [409, 'Você já escolheu um nickname.'],
  AIRCRAFT_NOT_FOUND:       [404, 'Aeronave não encontrada.'],
  AIRCRAFT_EXISTS:          [409, 'Já existe uma aeronave com esse ID.'],
  BOUND_CYCLE:              [400, 'Esses vínculos Bound criariam um ciclo: nenhuma das aeronaves poderia ser comprada.'],
  TIER_NOT_FOUND:           [404, 'Tier não encontrado.'],
  RIBBON_NOT_FOUND:         [404, 'Condecoração não encontrada.'],
  TIER_EXISTS:              [409, 'Esse tier já existe.'],
  ALREADY_UNLOCKED:         [409, 'Essa aeronave já está na frota.'],
  PREV_TIER_MISSING:        [400, 'Compre antes uma aeronave do tier anterior.'],
  CANNOT_DELETE_ADMIN:      [400, 'Remova antes o acesso de admin desta conta para poder excluí-la.'],
  BOUND_MISSING:            [400, 'Compre antes a aeronave Bound.'],
  INSUFFICIENT_POINTS:      [400, 'PM insuficientes.'],
  AMOUNT_ZERO:              [400, 'Informe uma quantidade diferente de zero.'],
  REASON_REQUIRED:          [400, 'Informe o motivo.'],
  USER_NOT_FOUND:           [404, 'Jogador não encontrado.'],
  BATCH_EMPTY:              [400, 'Selecione pelo menos um jogador.'],
  BATCH_INVALID_USERS:      [400, 'Alguns jogadores não podem receber PM (suspensos, sem nickname ou inexistentes).'],
  NOT_UNLOCKED:             [404, 'O jogador não tem essa aeronave.'],
  CANNOT_CHANGE_OWN_STATUS: [400, 'Você não pode suspender a si mesmo.'],
  MISSION_NOT_FOUND:        [404, 'Missão não encontrada.'],
  MISSION_NOT_OPEN:         [409, 'Esta missão não aceita mais alterações.'],
  AIRCRAFT_NOT_OWNED:       [400, 'Você só pode se inscrever com uma aeronave que já possui.'],
  NOT_FOUND:                [404, 'Não encontrado.'],
  UNDO_UNAVAILABLE:         [400, 'Só dá para desfazer a última compra.'],
  UNDO_EXPIRED:             [400, 'O tempo para desfazer essa compra acabou.'],
} as const satisfies Record<string, readonly [number, string]>;

export type ErrorCode = keyof typeof CATALOG;

export class AppError extends Error {
  constructor(public code: ErrorCode, public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export function fail(code: ErrorCode, message?: string, details?: unknown): AppError {
  const [status, defaultMessage] = CATALOG[code];
  return new AppError(code, status, message ?? defaultMessage, details);
}

/** Erro de violação de unicidade do Postgres */
export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === '23505';
