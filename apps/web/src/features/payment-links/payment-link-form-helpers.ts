interface ValidationIssue {
  message?: unknown;
  path?: unknown;
}

interface ApiError {
  message?: unknown;
  details?: unknown;
}

const DECIMAL_AMOUNT = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/;

export function canonicalPaymentLinkAmount(value: FormDataEntryValue | null): string {
  const amount = typeof value === 'string' ? value.trim() : '';
  if (!DECIMAL_AMOUNT.test(amount)) {
    throw new Error('Enter the amount as a number such as 1 or 1.25.');
  }
  if (!/[1-9]/.test(amount)) throw new Error('Amount must be greater than zero.');
  return amount;
}

export function paymentLinkErrorMessage(
  error: ApiError | null | undefined,
  fallback = 'Payment link could not be created.',
): string {
  const message = typeof error?.message === 'string' ? error.message : fallback;
  if (message !== 'Request validation failed' || !Array.isArray(error?.details)) return message;

  const issue = error.details.find(isValidationIssue);
  if (issue === undefined || typeof issue.message !== 'string') return message;
  const field = validationField(issue.path);
  return field === null ? issue.message : `${field}: ${issue.message}`;
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validationField(path: unknown): string | null {
  if (!Array.isArray(path)) return null;
  const key = path.filter((part): part is string => typeof part === 'string').join('.');
  const labels: Record<string, string> = {
    name: 'Link name',
    expiresAt: 'Link expiry',
    'defaults.title': 'Invoice title',
    'defaults.description': 'Description',
    'defaults.amount': 'Amount',
    'defaults.denomination': 'Denomination',
    'defaults.settlementAsset': 'Settlement asset',
    'defaults.expiresInHours': 'Checkout expiry',
    'defaults.recipients': 'Recipient',
  };
  return labels[key] ?? null;
}
