// Bun's mock.module('vscode', ...) mutates a process-global module registry that
// every test file shares — it is NOT scoped per file, and mock.restore() does not
// undo it. Any test file that calls mock.module('vscode', ...) can have its mock
// silently swapped out mid-await by another file's registration, so every file's
// mock must define this common baseline or dynamically-imported code elsewhere
// can crash on an undefined vscode API it expects to exist.
export function baseVscodeMock() {
	return {
		ViewColumn: { Beside: 2, Active: -1 },
		ProgressLocation: { Notification: 15, Window: 10 },
		QuickPickItemKind: { Separator: -1 },
		Range: class Range {
			start: { line: number; character: number };
			end: { line: number; character: number };
			constructor(sl: number, sc: number, el: number, ec: number) {
				this.start = { line: sl, character: sc };
				this.end = { line: el, character: ec };
			}
		},
	};
}
