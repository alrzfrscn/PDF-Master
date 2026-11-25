/**
 * pdfjs-dist 6.x calls ES2024/2025 APIs (Promise.withResolvers, Promise.try,
 * URL.parse) while parsing a PDF. An older Windows WebView2 runtime throws
 * before React can report anything, so install the missing globals first.
 */
export interface Resolvers<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

const PromiseEx = Promise as typeof Promise & {
  withResolvers?: <T>() => Resolvers<T>;
  try?: <T, A extends unknown[]>(fn: (...args: A) => T | PromiseLike<T>, ...args: A) => Promise<T>;
};

export function withResolvers<T>(): Resolvers<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function parseUrl(url: string, base?: string): URL | null {
  try {
    return new URL(url, base);
  } catch {
    return null;
  }
}

PromiseEx.withResolvers ??= withResolvers;
PromiseEx.try ??= <T, A extends unknown[]>(fn: (...args: A) => T | PromiseLike<T>, ...args: A) =>
  new Promise<T>((resolve) => resolve(fn(...args)));
(URL as typeof URL & { parse?: typeof parseUrl }).parse ??= parseUrl;
