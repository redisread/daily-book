declare global {
  interface Window {
    showToast?: (msg: string) => void;
  }
}

export {};
