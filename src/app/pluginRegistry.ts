/**
 * Plugin Registry
 * A neutral, framework-agnostic registry that maps tool keys to open handlers.
 * External consumers can register custom tools; core registers its built-in tools.
 */

/** Descriptor for a tool that can be opened programmatically */
export interface ToolHandler {
  /** Unique identifier (e.g. 'ai-inspection', 'measure', 'ik-tool') */
  key: string;
  /** Open the tool */
  open: () => void;
}

/** A simple mutable registry that maps tool keys to open handlers */
export class PluginRegistry {
  private handlers = new Map<string, ToolHandler>();

  /** Register a tool handler. Replaces any existing handler with the same key. */
  register(handler: ToolHandler): () => void {
    this.handlers.set(handler.key, handler);
    return () => {
      this.handlers.delete(handler.key);
    };
  }

  /** Open a tool by key. No-op if not registered. */
  open(key: string): void {
    this.handlers.get(key)?.open();
  }

  /** Check if a tool is registered. */
  has(key: string): boolean {
    return this.handlers.has(key);
  }

  /** Remove a tool handler. Returns true if the handler existed. */
  unregister(key: string): boolean {
    return this.handlers.delete(key);
  }

  /** Get all registered tool keys. */
  keys(): string[] {
    return [...this.handlers.keys()];
  }
}
