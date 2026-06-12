import { createRoot, type Root } from 'react-dom/client';

const reactRootByContainerKey = Symbol.for('cashew.reactRootByContainer');

type ReactRootGlobal = typeof globalThis & {
  [reactRootByContainerKey]?: WeakMap<Element, Root>;
};

const rootByContainer =
  (globalThis as ReactRootGlobal)[reactRootByContainerKey] ??
  new WeakMap<Element, Root>();

(globalThis as ReactRootGlobal)[reactRootByContainerKey] = rootByContainer;

export function getOrCreateRoot(container: Element) {
  const existingRoot = rootByContainer.get(container);

  if (existingRoot) {
    return existingRoot;
  }

  const root = createRoot(container);
  rootByContainer.set(container, root);
  return root;
}
