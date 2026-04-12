export function isElectron() {
  return typeof window !== 'undefined' && window.beacon?.isElectron === true;
}
