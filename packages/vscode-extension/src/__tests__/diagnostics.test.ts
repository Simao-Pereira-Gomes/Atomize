import { describe, expect, it, mock, spyOn } from 'bun:test';
import { baseVscodeMock } from './vscode-test-helpers.js';

describe('resolvePathToRange', () => {
	it('anchors an inherited range warning to extends rather than the first line', async () => {
		mock.module('vscode', () => baseVscodeMock());
		const { makeDiagnostic } = await import(`../validation/diagnostics.js?t=${Date.now()}-inherited-range`);
		const { TemplateValidator } = await import('@sppg2001/atomize-core/templates/validator');
		const text = [
			'# Conditional Template',
			'name: Conditional',
			'extends: "./base.atomize.yaml"',
			'tasks:',
			'  - id: implement',
			'    title: Implement',
			'    estimationPercentCondition:',
			'      - condition: { field: priority, operator: equals, value: 1 }',
			'        percent: 100',
		].join('\n');
		const result = new TemplateValidator().validate({
			name: 'Conditional', filter: {},
			tasks: [{ id: 'implement', title: 'Implement', estimationPercentCondition: [
				{ condition: { field: 'priority', operator: 'equals', value: 1 }, percent: 100 },
			] }],
			validation: { taskEstimationRange: { min: 10, max: 30 } },
		});
		const warning = result.warnings.find(item => item.path === 'validation.taskEstimationRange');
		if (!warning) throw new Error('Expected the deferred range warning');
		const doc = { getText: () => text, lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }) };
		const diagnostic = makeDiagnostic(warning.path, warning.message, 1, doc as never);
		expect(diagnostic.range.start.line).toBe(2);

		const withLocalRange = `${text}\nvalidation:\n  taskEstimationRange:\n    min: 10\n    max: 30`;
		const localDoc = { getText: () => withLocalRange, lineAt: (line: number) => ({ text: withLocalRange.split('\n')[line] ?? '' }) };
		expect(makeDiagnostic(warning.path, warning.message, 1, localDoc as never).range.start.line).toBe(10);
	});

	it('ignores comments and values that mention the target path before the real key', async () => {
		mock.module('vscode', () => baseVscodeMock());

		// We must re-import the module in EVERY test case where we want a fresh mock
		const { resolvePathToRange } = await import(`../validation/diagnostics.js?t=${Date.now()}-1`);

		const text = [
			'# filter.savedQuery: this comment should not receive the diagnostic',
			'description: "filter.savedQuery: this string should not receive the diagnostic"',
			'notes:',
			'  - "savedQuery: this list value should not receive the diagnostic"',
			'filter:',
			'  savedQuery:',
			'    path: "Shared Queries/Current Sprint"',
		].join('\n');
		const doc = {
			getText: () => text,
			lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }),
		};

		const range = resolvePathToRange('filter.savedQuery', doc as never);

		expect(range.start.line).toBe(5);
		expect(range.start.character).toBe(2);
		expect(range.end.line).toBe(5);
	});

	it('resolves ["quoted.key"] notation to the field key line, not the parent', async () => {
		mock.module('vscode', () => baseVscodeMock());

		const { resolvePathToRange } = await import(`../validation/diagnostics.js?t=${Date.now()}-2`);

		const text = [
			'tasks:',
			'  - title: My Task',
			'    customFields:',
			'      System.Title: |',
			'        Line one',
		].join('\n');
		const doc = {
			getText: () => text,
			lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }),
		};

		const range = resolvePathToRange('tasks[0].customFields["System.Title"]', doc as never);

		expect(range.start.line).toBe(3);
	});

	it('resolves a task field to the line inside the indexed task, not an earlier task', async () => {
		mock.module('vscode', () => baseVscodeMock());

		const { resolvePathToRange } = await import(`../validation/diagnostics.js?t=${Date.now()}-5`);

		const text = [
			'name: Repeat',
			'tasks:',
			'  - id: design',
			'    title: Design',
			'  - id: review',
			'    title: Review',
			'    repeat: 25',
			'    dependsOn: [design]',
			'  - id: merge',
			'    title: Merge',
			'    repeat: 30',
			'    dependsOn: [review]',
		].join('\n');
		const doc = {
			getText: () => text,
			lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }),
		};

		expect(resolvePathToRange('tasks.1.repeat', doc as never).start.line).toBe(6);
		expect(resolvePathToRange('tasks.2.repeat', doc as never).start.line).toBe(10);
		expect(resolvePathToRange('tasks.2.dependsOn', doc as never).start.line).toBe(11);
		expect(resolvePathToRange('tasks[1].dependsOn', doc as never).start.line).toBe(7);
	});

	it('falls back to the indexed task line when the task lacks the field', async () => {
		mock.module('vscode', () => baseVscodeMock());

		const { resolvePathToRange } = await import(`../validation/diagnostics.js?t=${Date.now()}-6`);

		const text = ['tasks:', '  - title: A', '    repeat: 2', '  - title: B', 'validation:', '  repeat: 3'].join('\n');
		const doc = {
			getText: () => text,
			lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }),
		};

		expect(resolvePathToRange('tasks.1.repeat', doc as never).start.line).toBe(3);
	});
});

describe('makeDiagnostic', () => {
	it('shows a final allocation range error on the task percentage field', async () => {
		mock.module('vscode', () => baseVscodeMock());
		const { TemplateValidator } = await import('@sppg2001/atomize-core/templates/validator');
		const { makeDiagnostic } = await import(`../validation/diagnostics.js?t=${Date.now()}-range`);
		const text = 'tasks:\n  - title: Single\n    estimationPercent: 20';
		const doc = { getText: () => text, lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }) };
		const result = new TemplateValidator().validate({
			name: 'Range', filter: {}, tasks: [{ title: 'Single', estimationPercent: 20 }],
			estimation: { normalize: 'always' }, validation: { taskEstimationRange: { min: 10, max: 30 } },
		});
		const error = result.errors.find(item => item.code === 'TASK_ESTIMATION_OUT_OF_RANGE');
		if (!error) throw new Error('Expected a task allocation range error');
		const diagnostic = makeDiagnostic(error.path, error.message, 0, doc as never, error.code);
		expect(diagnostic.range.start.line).toBe(2);
		expect(diagnostic.severity).toBe(0);
		expect(diagnostic.code).toBe('TASK_ESTIMATION_OUT_OF_RANGE');
		expect(diagnostic.message).toContain('Final task allocation is 100%');
	});
	const text = ['estimation:', '  minimumTaskPoints: 0.5'].join('\n');
	const doc = {
		getText: () => text,
		lineAt: (line: number) => ({ text: text.split('\n')[line] ?? '' }),
	};

	it('marks minimumTaskPoints diagnostics as deprecated', async () => {
		mock.module('vscode', () => baseVscodeMock());
		const { makeDiagnostic } = await import(`../validation/diagnostics.js?t=${Date.now()}-3`);

		for (const code of ['DEPRECATED_MINIMUM_TASK_POINTS', 'DUPLICATE_MINIMUM_TASK_ESTIMATE']) {
			const d = makeDiagnostic('estimation.minimumTaskPoints', 'msg', 1, doc as never, code);
			expect(d.tags).toEqual([2]);
			expect(d.range.start.line).toBe(1);
		}
	});

	it('does not tag other warnings', async () => {
		mock.module('vscode', () => baseVscodeMock());
		const { makeDiagnostic } = await import(`../validation/diagnostics.js?t=${Date.now()}-4`);

		const d = makeDiagnostic('filter.savedQuery', 'msg', 1, doc as never, 'SAVED_QUERY_WITH_STRUCTURED_FILTER');
		expect(d.tags).toBeUndefined();
	});
});

describe('passive validation recovery', () => {
	it('contains synchronous path failures and permits another validation attempt', async () => {
		mock.module('vscode', () => baseVscodeMock());
		const { runDiagnosticValidation } = await import(`../validation/diagnostics.js?t=${Date.now()}-path-failure`);
		const failure = new Error('Document path unavailable');
		const onError = mock(() => {});
		const diagnostics = { set: mock(() => {}) };
		const doc = {
			uri: {
				toString: () => 'file:///broken.atomize.yaml',
				get fsPath(): string { throw failure; },
			},
		};

		expect(() => runDiagnosticValidation(doc as never, diagnostics as never, undefined, onError)).not.toThrow();
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(onError).toHaveBeenCalledWith(failure);
		expect(diagnostics.set).not.toHaveBeenCalled();

		runDiagnosticValidation(doc as never, diagnostics as never, undefined, onError);
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(onError).toHaveBeenCalledTimes(2);
	});

	it('keeps existing diagnostics when loading a file fails and validates a later request', async () => {
		mock.module('vscode', () => baseVscodeMock());
		const failure = new Error('Invalid YAML');
		let finishLoad: ((value: unknown) => void) | undefined;
		const loadSource = mock(() => new Promise(resolve => { finishLoad = resolve; }));
		mock.module('../core-library.js', () => ({ createTemplateLibrary: () => ({ loadSource }) }));
		const { runDiagnosticValidation } = await import(`../validation/diagnostics.js?t=${Date.now()}-load-failure`);
		const doc = {
			uri: { toString: () => 'file:///recover.atomize.yaml', fsPath: '/recover.atomize.yaml' },
			getText: () => 'name: Recovered',
			lineAt: () => ({ text: 'name: Recovered' }),
		};
		const set = mock(() => {});
		const onError = mock(() => {});
		const onSuccess = mock(() => {});
		loadSource.mockImplementationOnce(() => Promise.reject(failure));
		runDiagnosticValidation(doc as never, { set } as never, onSuccess, onError);
		// A save while opening validation is still running must be retried.
		runDiagnosticValidation(doc as never, { set } as never, onSuccess, onError);
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(onError).toHaveBeenCalledWith(failure);
		expect(set).not.toHaveBeenCalled();
		expect(loadSource).toHaveBeenCalledTimes(2);

		finishLoad?.({ template: { name: 'Recovered', filter: {}, tasks: [{ title: 'Implement', estimationPercent: 100 }] } });
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(onSuccess).toHaveBeenCalledTimes(1);
		expect(set).toHaveBeenCalledTimes(1);
	});
});

it('contains errors from the validation failure notification', async () => {
	mock.module('vscode', () => baseVscodeMock());
	mock.module('../core-library.js', () => ({
		createTemplateLibrary: () => { throw new Error('Library unavailable'); },
	}));
	const { runDiagnosticValidation } = await import(`../validation/diagnostics.js?t=${Date.now()}-notification-failure`);
	const notificationError = new Error('Notification unavailable');
	const onError = mock(() => { throw notificationError; });
	const logged = spyOn(console, 'error').mockImplementation(() => {});
	try {
		const doc = { uri: { toString: () => 'file:///notification.atomize.yaml', fsPath: '/notification.atomize.yaml' } };
		runDiagnosticValidation(doc as never, { set: mock(() => {}) } as never, undefined, onError);
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(logged).toHaveBeenCalledWith('Atomize: could not report validation failure.', notificationError);
		runDiagnosticValidation(doc as never, { set: mock(() => {}) } as never, undefined, onError);
		await new Promise(resolve => setTimeout(resolve, 0));
		expect(onError).toHaveBeenCalledTimes(2);
	} finally {
		logged.mockRestore();
	}
});
