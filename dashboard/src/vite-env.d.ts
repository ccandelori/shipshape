/// <reference types="vite/client" />

declare module '*.css';

// Vite ?raw import — markdown files imported as strings at build time.
declare module '*.md?raw' {
  const content: string;
  export default content;
}
declare module '*.txt?raw' {
  const content: string;
  export default content;
}
declare module '*.json?raw' {
  const content: string;
  export default content;
}
