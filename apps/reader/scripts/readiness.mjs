export function stripAnsi(text) {
  return String(text).replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}
