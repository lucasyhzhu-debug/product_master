import { lazy } from 'react';

/**
 * Extends React.LazyExoticComponent with a .preload() method for hover prefetching.
 * Calling .preload() fires the dynamic import and lets the browser cache the chunk
 * before the user navigates to the route.
 */
export type PreloadableComponent<T extends React.ComponentType<unknown>> =
  React.LazyExoticComponent<T> & { preload: () => void };

export function lazyWithPreload<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>
): PreloadableComponent<T> {
  const Component = lazy(factory) as PreloadableComponent<T>;
  Component.preload = () => { factory(); }; // fire-and-forget; browser caches the module
  return Component;
}
