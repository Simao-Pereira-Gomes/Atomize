import { describe, expect, it } from 'vitest';
import {
	CliAbsentError,
	CliRuntimeError,
	CliVersionError,
	invoke,
	MalformedOutputError,
	probeCli,
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

	it('throws CliVersionError when CLI version is below minimum', async () => {
		const execute = makeExecutor({ code: 0, stdout: 'atomize 1.9.0\n', stderr: '' });
		const error = await probeCli(execute).catch(e => e);
		expect(error).toBeInstanceOf(CliVersionError);
		expect((error as CliVersionError).version).toBe('1.9.0');
		expect((error as CliVersionError).minimum).toBe('2.0.1');
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
