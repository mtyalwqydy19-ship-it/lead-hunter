// تعريفات مصغّرة لـ React لأن حزم @types غير متاحة في بيئة البناء الحالية.
// عند تثبيت @types/react عبر npm install احذف هذا الملف.
declare module 'react' {
  export type ReactNode = any;
  export type CSSProperties = Record<string, string | number>;
  export type FormEvent<T = any> = { preventDefault(): void; target: any; currentTarget: any };
  export type ChangeEvent<T = any> = { target: any; currentTarget: any };
  export function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: unknown[]): void;
  export function useRef<T = any>(init?: T | null): { current: T };
  export function useMemo<T>(fn: () => T, deps: unknown[]): T;
  export function useCallback<T extends (...a: any[]) => any>(fn: T, deps: unknown[]): T;
  export function createContext<T>(d: T): any;
  export function useContext<T = any>(c: any): T;
  export const StrictMode: any;
  export const Fragment: any;
}
declare module 'react/jsx-runtime' { export const jsx: any; export const jsxs: any; export const Fragment: any }
declare module 'react-dom/client' { export function createRoot(el: Element): { render(n: any): void } }
declare namespace JSX { interface IntrinsicElements { [k: string]: any } interface Element {} interface ElementChildrenAttribute { children: {} } interface IntrinsicAttributes { key?: any } }
