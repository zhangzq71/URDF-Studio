import { DOMParser as LinkedomDOMParser } from 'linkedom';

type WorkerXmlScope = typeof globalThis & {
  DOMParser?: typeof DOMParser;
  document?: Document;
  XMLSerializer?: typeof XMLSerializer;
};

type WorkerImageListener = (event: { type: 'error' | 'load'; target: WorkerImageElementPolyfill }) => void;

class WorkerImageElementPolyfill {
  complete = false;
  crossOrigin: string | null = null;
  height = 1;
  width = 1;

  private readonly listeners = {
    error: new Set<WorkerImageListener>(),
    load: new Set<WorkerImageListener>(),
  };

  private currentSrc = '';

  addEventListener(type: 'error' | 'load', listener: WorkerImageListener): void {
    this.listeners[type].add(listener);
  }

  removeEventListener(type: 'error' | 'load', listener: WorkerImageListener): void {
    this.listeners[type].delete(listener);
  }

  set src(nextSrc: string) {
    this.currentSrc = nextSrc;
    queueMicrotask(() => {
      this.complete = true;
      const event = { type: 'load' as const, target: this };
      this.listeners.load.forEach((listener) => {
        listener.call(this, event);
      });
    });
  }

  get src(): string {
    return this.currentSrc;
  }
}

function createWorkerDocumentPolyfill(): Document {
  return {
    createElementNS(_namespace: string, name: string) {
      if (name === 'img') {
        return new WorkerImageElementPolyfill();
      }

      return {
        style: {},
      };
    },
  } as unknown as Document;
}

class WorkerXMLSerializerPolyfill {
  serializeToString(root: Node): string {
    const maybeDocument = root as Document;
    if (
      maybeDocument?.nodeType === 9
      && maybeDocument.documentElement
      && typeof maybeDocument.documentElement.toString === 'function'
    ) {
      return maybeDocument.documentElement.toString();
    }

    if (typeof (root as { toString?: () => string })?.toString === 'function') {
      return (root as { toString: () => string }).toString();
    }

    return '';
  }
}

export function ensureWorkerXmlDomApis(scope: WorkerXmlScope = globalThis as WorkerXmlScope): void {
  if (typeof scope.DOMParser !== 'function') {
    scope.DOMParser = LinkedomDOMParser as unknown as typeof DOMParser;
  }

  if (!scope.document || typeof scope.document.createElementNS !== 'function') {
    scope.document = createWorkerDocumentPolyfill();
  }

  if (typeof scope.XMLSerializer !== 'function') {
    scope.XMLSerializer = WorkerXMLSerializerPolyfill as unknown as typeof XMLSerializer;
  }
}
