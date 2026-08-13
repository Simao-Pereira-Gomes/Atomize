import { describe, expect, it } from 'vitest';
import {
	CliAbsentError,
	CliProbeError,
	CliRuntimeError,
	CliVersionError,
	invoke,
	listCatalogTemplates,
	MalformedOutputError,
	probeCli,
	rotateAzureDevOpsToken,
} from '../cli-bridge.js';

function makeExecutor(result: { code: number | null; stdout: string; stderr: string }) {
	return () => Promise.resolve(result);
}

function makeFailingExecutor(error = new Error('spawn ENOENT')) {
	return () => Promise.reject(error);
}

describe('probeCli', () => {
	it('returns version when CLI is found and meets minimum', async () => {
		const execute = makeExecutor({ code: 0, stdout: 'atomize 2.1.0\n', stderr: '' });
		const result = await probeCli(execute);
		expect(result.version).toBe('2.1.0');
	});

	it('throws CliAbsentError when CLI is not in PATH', async () => {
		await expect(probeCli(makeFailingExecutor())).rejects.toBeInstanceOf(CliAbsentError);
	});

	it('treats the macOS missing-executable error as an absent CLI', async () => {
		await expect(probeCli(makeFailingExecutor(new Error('No such file or directory (os error 2)')))).rejects.toBeInstanceOf(CliAbsentError);
	});

	it('throws CliProbeError when the executable fails for a reason other than being absent', async () => {
		await expect(probeCli(makeFailingExecutor(new Error('permission denied')))).rejects.toBeInstanceOf(CliProbeError);
	});

	it('throws CliProbeError when the version command exits unsuccessfully', async () => {
		const error = await probeCli(makeExecutor({ code: 1, stdout: '', stderr: 'runtime failure' })).catch(e => e);
		expect(error).toBeInstanceOf(CliProbeError);
		expect((error as CliProbeError).message).toBe('runtime failure');
	});

	it('throws CliProbeError when the CLI does not report a semantic version', async () => {
		await expect(probeCli(makeExecutor({ code: 0, stdout: 'atomize development', stderr: '' }))).rejects.toBeInstanceOf(CliProbeError);
	});

	it('throws CliVersionError when CLI version is below minimum', async () => {
	const execute = makeExecutor({ code: 0, stdout: 'atomize 2.0.1\n', stderr: '' });
		const error = await probeCli(execute).catch(e => e);
		expect(error).toBeInstanceOf(CliVersionError);
		expect((error as CliVersionError).version).toBe('2.0.1');
		expect((error as CliVersionError).minimum).toBe('2.0.2');
	});
});

describe('invoke', () => {
	it('returns parsed JSON on successful exit', async () => {
		const execute = makeExecutor({ code: 0, stdout: '{"items":[]}', stderr: '' });
		const result = await invoke(['template', 'list', '--json'], execute);
		expect(result).toEqual({ items: [] });
	});

	it('throws CliRuntimeError on non-zero exit code', async () => {
		const execute = makeExecutor({ code: 1, stdout: '', stderr: 'template not found' });
		const error = await invoke(['template', 'list', '--json'], execute).catch(e => e);
		expect(error).toBeInstanceOf(CliRuntimeError);
		expect((error as CliRuntimeError).exitCode).toBe(1);
		expect((error as CliRuntimeError).message).toBe('template not found');
	});

	it('throws MalformedOutputError when stdout is not valid JSON', async () => {
		const execute = makeExecutor({ code: 0, stdout: 'not json', stderr: '' });
		const error = await invoke(['template', 'list', '--json'], execute).catch(e => e);
		expect(error).toBeInstanceOf(MalformedOutputError);
		expect((error as MalformedOutputError).output).toBe('not json');
	});
});

describe('listCatalogTemplates', () => {
	it('requests only Templates in JSON mode', async () => {
		const calls: string[][] = [];
		await listCatalogTemplates(async (args) => {
			calls.push(args);
			return { code: 0, stdout: '[]', stderr: '' };
		});
		expect(calls).toEqual([['template', 'list', '--type', 'template', '--json']]);
	});
});

describe('rotateAzureDevOpsToken', () => {
	it('sends the new token only through stdin', async () => {
		const calls: Array<{ args: string[]; stdin: string }> = [];
		await rotateAzureDevOpsToken('website-team', 'new-secret', async (args, stdin) => {
			calls.push({ args, stdin });
			return { code: 0, stdout: '', stderr: '' };
		});
		expect(calls).toEqual([{
			args: ['auth', 'rotate', 'website-team', '--pat-stdin'],
			stdin: 'new-secret',
		}]);
	});
});
