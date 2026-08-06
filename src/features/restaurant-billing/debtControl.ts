export type DebtControlTone = 'clear' | 'warning' | 'countdown' | 'blocked';

export type DebtControlInput = {
  debtAmount: number;
  warningAmount: number;
  limitAmount: number;
  limitReachedAt: string | null;
  deadline: string | null;
  blocked: boolean;
  now?: Date;
};

export type DebtControlState = {
  tone: DebtControlTone;
  secondsRemaining: number | null;
  blocksNewWork: boolean;
};

export const getDebtControlState = ({
  debtAmount,
  warningAmount,
  limitAmount,
  deadline,
  blocked,
  now = new Date()
}: DebtControlInput): DebtControlState => {
  if (debtAmount < warningAmount) {
    return { tone: 'clear', secondsRemaining: null, blocksNewWork: false };
  }

  if (debtAmount < limitAmount) {
    return { tone: 'warning', secondsRemaining: null, blocksNewWork: false };
  }

  const deadlineMs = deadline ? new Date(deadline).getTime() : Number.NaN;
  const remainingMs = Number.isFinite(deadlineMs) ? deadlineMs - now.getTime() : 0;
  if (blocked || remainingMs <= 0) {
    return { tone: 'blocked', secondsRemaining: 0, blocksNewWork: true };
  }

  return {
    tone: 'countdown',
    secondsRemaining: Math.ceil(remainingMs / 1_000),
    blocksNewWork: false
  };
};
