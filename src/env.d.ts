declare global {
  interface Window {
    showToast?: (msg: string) => void;
  }
}

declare module "*.yaml?raw" {
  const content: string;
  export default content;
}

export {};
