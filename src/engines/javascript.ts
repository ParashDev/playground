import { SANDBOX_BOOTSTRAP } from "./sandbox-bootstrap";
import type { Engine, LanguageId, RunOutput, RunResult } from "./types";

const TIMEOUT_MS = 5000;

/** Transpiles TypeScript to JavaScript. Supplied by the editor layer. */
export type Transpiler = (source: string) => Promise<string>;

/**
 * Runs JavaScript in a sandboxed iframe.
 *
 * The frame is created with `sandbox="allow-scripts"` and deliberately without
 * `allow-same-origin`, so it lands on an opaque origin: user code cannot reach
 * our DOM, cookies, or IndexedDB. An infinite loop cannot be interrupted from
 * outside, so the timeout tears the frame down and builds a fresh one.
 */
export class JavaScriptEngine implements Engine {
  readonly id: LanguageId;
  readonly monacoLanguage: string;

  private frame: HTMLIFrameElement | null = null;
  private ready: Promise<void> | null = null;
  private runId = 0;
  private active: {
    id: number;
    outputs: RunOutput[];
    finish: (rendered: boolean) => void;
  } | null = null;
  private lateListeners = new Set<(output: RunOutput) => void>();
  private transpile: Transpiler | null;
  private mountPoint: HTMLElement | null = null;
  private visible = true;

  constructor(id: LanguageId = "javascript", transpile: Transpiler | null = null) {
    this.id = id;
    this.monacoLanguage = id === "typescript" ? "typescript" : "javascript";
    this.transpile = transpile;
  }

  setTranspiler(transpile: Transpiler | null): void {
    this.transpile = transpile;
  }

  /**
   * Where the sandbox frame lives in the DOM. It doubles as the preview pane,
   * so it is appended here once and never moved — reparenting an iframe makes
   * the browser tear down and reload its document, which would kill the
   * sandbox mid-session.
   */
  mount(element: HTMLElement): void {
    this.mountPoint = element;
    if (this.frame && this.frame.parentElement !== element) {
      element.appendChild(this.frame);
    }
  }

  /** The preview box is shared with the web engine, so each frame is shown or
   *  hidden by mode rather than being added and removed. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    if (this.frame) this.frame.style.display = visible ? "block" : "none";
  }

  /** Output that arrives after a run resolved — setTimeout, late promises. */
  onLateOutput(listener: (output: RunOutput) => void): () => void {
    this.lateListeners.add(listener);
    return () => this.lateListeners.delete(listener);
  }

  private handleMessage = (event: MessageEvent) => {
    // The frame is on an opaque origin, so `event.origin` is the string "null"
    // and useless for validation. Identity of the sending window is the check.
    if (!this.frame || event.source !== this.frame.contentWindow) return;
    const data = event.data;
    if (!data || data.channel !== "playground") return;

    if (data.type === "height") {
      // Grow the frame to fit its content so the wrapper is what overflows.
      // min-height keeps it filling the pane when the content is short.
      if (this.frame) this.frame.style.height = `${Math.max(1, Number(data.height) || 0)}px`;
      return;
    }

    if (data.type === "out") {
      if (this.active && data.runId === this.active.id) {
        this.active.outputs.push(data.output as RunOutput);
      } else {
        for (const listener of this.lateListeners) listener(data.output as RunOutput);
      }
    } else if (data.type === "done") {
      if (this.active && data.runId === this.active.id) {
        this.active.finish(Boolean(data.rendered));
      }
    }
  };

  async init(): Promise<void> {
    if (this.ready) return this.ready;

    this.ready = new Promise<void>((resolve) => {
      const frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.title = "Preview";
      // Height is driven by the sandbox's own content measurement; min-height
      // makes it fill the pane when the page is shorter than the viewport.
      frame.style.cssText =
        "display:block;width:100%;min-height:100%;height:100%;border:0;background:#fff";
      if (!this.visible) frame.style.display = "none";
      // Deliberately plain: no height or overflow on `html`, so the document
      // scrolls its own viewport the way any normal page does. Constraining
      // the root to 100% is what makes overflow unreachable on iOS.
      const previewStyles =
        "html{-webkit-text-size-adjust:100%}" +
        "body{margin:0;padding:16px;box-sizing:border-box;" +
        "font-family:system-ui,sans-serif;color:#111;overflow-wrap:break-word}";
      frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${previewStyles}</style></head><body><script>${SANDBOX_BOOTSTRAP}<\/script></body></html>`;

      const onReady = (event: MessageEvent) => {
        if (event.source !== frame.contentWindow) return;
        if (event.data?.channel === "playground" && event.data.type === "ready") {
          window.removeEventListener("message", onReady);
          resolve();
        }
      };

      window.addEventListener("message", onReady);
      window.addEventListener("message", this.handleMessage);
      (this.mountPoint ?? document.body).appendChild(frame);
      this.frame = frame;
    });

    return this.ready;
  }

  async run(source: string): Promise<RunResult> {
    const started = performance.now();

    let code = source;
    if (this.transpile) {
      try {
        code = await this.transpile(source);
      } catch (error) {
        return {
          outputs: [
            {
              kind: "error",
              message: error instanceof Error ? error.message : String(error),
            },
          ],
          durationMs: performance.now() - started,
        };
      }
    }

    await this.init();
    const frame = this.frame;
    if (!frame?.contentWindow) throw new Error("Sandbox failed to start");

    const id = ++this.runId;
    const outputs: RunOutput[] = [];
    let rendered = false;

    const timedOut = await new Promise<boolean>((resolve) => {
      const timer = window.setTimeout(() => {
        this.active = null;
        resolve(true);
      }, TIMEOUT_MS);

      this.active = {
        id,
        outputs,
        finish: (didRender: boolean) => {
          rendered = didRender;
          window.clearTimeout(timer);
          this.active = null;
          resolve(false);
        },
      };

      frame.contentWindow!.postMessage({ channel: "playground", type: "run", runId: id, code }, "*");
    });

    if (timedOut) {
      // Nothing can stop a busy loop from out here, so the frame is discarded
      // and rebuilt. Any output it produced before hanging is kept.
      await this.reset();
      outputs.push({
        kind: "error",
        message: `Execution timed out after ${TIMEOUT_MS / 1000}s. The sandbox was restarted — check for an infinite loop.`,
      });
    }

    if (outputs.length === 0 && !rendered) {
      outputs.push({
        kind: "notice",
        text: "Ran without output — use console.log to print, or write to document to render",
      });
    }

    return { outputs, durationMs: performance.now() - started, rendered };
  }

  async reset(): Promise<void> {
    this.dispose();
    await this.init();
  }

  dispose(): void {
    window.removeEventListener("message", this.handleMessage);
    this.frame?.remove();
    this.frame = null;
    this.ready = null;
    this.active = null;
  }
}
