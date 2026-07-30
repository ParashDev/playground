import type { Engine, RunOutput, RunResult } from "./types";

const LOAD_TIMEOUT_MS = 8000;

/**
 * Runs a whole HTML/CSS/JS document.
 *
 * Unlike the JavaScript engine, this builds a fresh iframe for every run. The
 * user owns the entire document here, so there is no sandbox state worth
 * keeping and a new frame guarantees a clean slate — no leftover timers,
 * listeners, or globals from the previous run.
 *
 * Completion comes from the frame's `load` event rather than a `done` message:
 * the page's scripts run as it parses, so there is no request/reply to wait on.
 */
export class WebEngine implements Engine {
  readonly id = "web" as const;
  readonly monacoLanguage = "html";

  private frame: HTMLIFrameElement | null = null;
  private mountPoint: HTMLElement | null = null;
  private collecting: RunOutput[] | null = null;
  private lateListeners = new Set<(output: RunOutput) => void>();
  private visible = false;

  /**
   * Idempotent: `addEventListener` with the same function reference is a no-op.
   * Called on every run rather than once in the constructor, because
   * `dispose()` detaches it and the engine object outlives that — React
   * StrictMode disposes on its simulated unmount while the ref keeps the same
   * instance, which would otherwise leave the engine permanently deaf.
   */
  private listen(): void {
    window.addEventListener("message", this.handleMessage);
  }

  mount(element: HTMLElement): void {
    this.mountPoint = element;
  }

  /** The preview box is shared with the JavaScript sandbox, so each frame is
   *  shown or hidden by mode rather than being added and removed. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.frame) this.frame.style.display = visible ? "block" : "none";
  }

  onLateOutput(listener: (output: RunOutput) => void): () => void {
    this.lateListeners.add(listener);
    return () => this.lateListeners.delete(listener);
  }

  private handleMessage = (event: MessageEvent) => {
    // Identity of the sending window is the check — the frame is on an opaque
    // origin, so `event.origin` is the useless string "null". A frame from a
    // previous run is no longer `this.frame`, so its late chatter is dropped.
    if (!this.frame || event.source !== this.frame.contentWindow) return;
    const data = event.data;
    if (!data || data.channel !== "playground") return;

    // Height reports are deliberately ignored here, unlike in the JavaScript
    // sandbox. Sizing the frame to its content deadlocks against viewport
    // units: `min-height:100vh` shrinks as the frame shrinks, which shrinks the
    // reported height again — the starter page collapsed to 1px. A web preview
    // is a viewport, so the frame keeps the pane's size and the page scrolls
    // inside it, exactly as a browser tab does.
    if (data.type === "height") return;

    if (data.type === "out") {
      // No runId matching here: in document mode the bootstrap never receives a
      // run message, so it has no id to echo. The frame identity check above is
      // what scopes these messages to the current run.
      if (this.collecting) this.collecting.push(data.output as RunOutput);
      else for (const listener of this.lateListeners) listener(data.output as RunOutput);
    }
  };

  async init(): Promise<void> {
    // Nothing to warm up: each run builds its own frame.
  }

  /** @param source a complete HTML document, from `assembleWebDocument`. */
  async run(source: string): Promise<RunResult> {
    const started = performance.now();
    const outputs: RunOutput[] = [];

    this.listen();
    this.frame?.remove();
    this.frame = null;
    this.collecting = outputs;

    const frame = document.createElement("iframe");
    frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups allow-modals");
    frame.title = "Preview";
    frame.style.cssText =
      "display:block;width:100%;min-height:100%;height:100%;border:0;background:#fff";
    if (!this.visible) frame.style.display = "none";

    const timedOut = await new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => resolve(true), LOAD_TIMEOUT_MS);
      frame.addEventListener("load", () => {
        window.clearTimeout(timer);
        resolve(false);
      });

      // Assigned before insertion so messages emitted during parse are matched.
      this.frame = frame;
      frame.srcdoc = source;
      (this.mountPoint ?? document.body).appendChild(frame);
    });

    // Anything logged from here on belongs to timers and event handlers, and is
    // routed to the late listeners instead of this run's result.
    this.collecting = null;

    if (timedOut) {
      outputs.push({
        kind: "error",
        message: `The page did not finish loading within ${LOAD_TIMEOUT_MS / 1000}s. It is still running — check for a blocking loop.`,
      });
    } else if (outputs.length === 0) {
      outputs.push({ kind: "notice", text: "Page rendered — see the Preview panel" });
    }

    return { outputs, durationMs: performance.now() - started, rendered: true };
  }

  async reset(): Promise<void> {
    this.frame?.remove();
    this.frame = null;
    this.collecting = null;
  }

  dispose(): void {
    window.removeEventListener("message", this.handleMessage);
    this.frame?.remove();
    this.frame = null;
    this.collecting = null;
  }
}
