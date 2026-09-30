const TONES = {
  LOGIN_FAILED: 'red',
  DELETE: 'red',
  CANCEL: 'red',
  REVERSE: 'red',
  REJECT: 'red',
  REOPEN: 'amber',
  REVERT: 'amber',
  ROLE_CHANGE: 'amber',
  PASSWORD_RESET: 'amber',
  STATUS_CHANGE: 'amber',
  APPROVE: 'green',
  FINALIZE: 'green',
  PAYMENT: 'green',
  RECEIVE: 'green',
  CREATE: 'blue',
  IMPORT: 'blue',
  UPLOAD: 'blue',
};

export const actionTone = (action) => TONES[action] ?? 'gray';

/** Quick filters for the investigations auditors run most (spec §57). */
export const AUDIT_PRESETS = [
  { label: 'All activity', action: '' },
  { label: 'Logins', action: 'LOGIN,LOGIN_FAILED,LOGOUT' },
  { label: 'Role & access changes', action: 'ROLE_CHANGE,PASSWORD_RESET,STATUS_CHANGE' },
  { label: 'Approvals', action: 'SUBMIT,APPROVE,REJECT,FINALIZE' },
  { label: 'Reopens', action: 'REOPEN' },
  { label: 'Payments', action: 'PAYMENT,REVERSE' },
  { label: 'Imports', action: 'IMPORT' },
  { label: 'Exports', action: 'EXPORT' },
];
