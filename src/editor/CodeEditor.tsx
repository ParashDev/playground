import { useCallback, useRef } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { Transpiler } from "../engines/javascript";

export interface CodeEditorProps {
  value: string;
  language: string;
  dark: boolean;
  onChange: (value: string) => void;
  onRun: () => void;
  /** Called once Monaco is up, with a transpiler backed by its TS service. */
  onTranspilerReady: (transpile: Transpiler) => void;
}

/**
 * Monaco — the editor from VS Code — loaded from jsDelivr by @monaco-editor/react.
 * Keeping it on the public CDN is deliberate: it stays out of our bundle and
 * off our bandwidth bill, and it is the same copy most sites already cache.
 */
export function CodeEditor({
  value,
  language,
  dark,
  onChange,
  onRun,
  onTranspilerReady,
}: CodeEditorProps) {
  // The run keybinding is registered once but must always call the latest
  // handler, so it reads through a ref rather than closing over the prop.
  const runRef = useRef(onRun);
  runRef.current = onRun;

  const configure = useCallback((monaco: Monaco) => {
    monaco.editor.defineTheme("playground-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#ffffff",
        "editorGutter.background": "#ffffff",
        "editorLineNumber.foreground": "#b8bcc4",
        "editorLineNumber.activeForeground": "#0d9488",
      },
    });

    monaco.editor.defineTheme("playground-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#141518",
        "editorGutter.background": "#141518",
        "editorLineNumber.foreground": "#4a4f59",
        "editorLineNumber.activeForeground": "#0d9488",
      },
    });

    // User code is wrapped in an async function before it executes, so
    // top-level await is genuinely valid here. 1375 and 1378 are the two
    // diagnostics that would otherwise flag it as an error.
    const topLevelAwait = [1375, 1378];

    const compilerOptions = {
      target: monaco.languages.typescript.ScriptTarget.ES2020,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      strict: true,
      noEmit: false,
      lib: ["es2020", "dom"],
    };

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.javascriptDefaults.setCompilerOptions(compilerOptions);
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      diagnosticCodesToIgnore: topLevelAwait,
    });
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      diagnosticCodesToIgnore: topLevelAwait,
    });
  }, []);

  const handleMount = useCallback<OnMount>(
    (editor, monaco) => {
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());

      // The same TypeScript service that powers the red squiggles also emits
      // the JavaScript we execute, so what runs is exactly what was checked.
      onTranspilerReady(async (source: string) => {
        const model = editor.getModel();
        if (!model) return source;

        const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
        const client = await getWorker(model.uri);
        const emitted = await client.getEmitOutput(model.uri.toString());

        const file = emitted.outputFiles.find((f: { name: string }) => f.name.endsWith(".js"));
        return file ? file.text : source;
      });
    },
    [onTranspilerReady],
  );

  return (
    <Editor
      value={value}
      language={language}
      theme={dark ? "playground-dark" : "playground-light"}
      beforeMount={configure}
      onMount={handleMount}
      onChange={(next) => onChange(next ?? "")}
      loading={
        <div className="flex h-full items-center justify-center text-sm text-muted dark:text-muted-dark">
          Loading editor…
        </div>
      }
      options={{
        fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
        fontSize: 13,
        lineHeight: 1.7,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        padding: { top: 16, bottom: 16 },
        renderLineHighlight: "none",
        smoothScrolling: true,
        tabSize: 2,
        automaticLayout: true,
        overviewRulerLanes: 0,
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
        fixedOverflowWidgets: true,
      }}
    />
  );
}
