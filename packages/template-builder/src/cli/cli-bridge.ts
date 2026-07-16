import { gte, valid } from 'semver';

export const CLI_MINIMUM_VERSION = '2.0.1';

export type CliExecutor = (args: string[]) => Promise<{ code: number | null; stdout: string; stderr: string }>;

export interface CliProbeResult {
	version: string;
}

export class CliAbsentError extends Error {
	override readonly name = 'CliAbsentError';
	constructor() {
		super('Atomize CLI not found. Run `npm install -g @sppg2001/atomize` to install.');
	}
}

export class CliVersionError extends Error {
	override readonly name = 'CliVersionError';
	constructor(
		public readonly version: string,
		public readonly minimum: string,
	) {
		super(`Atomize CLI ${version} is below the required minimum ${minimum}.`);
	}
}

export class CliProbeError extends Error {
	override readonly name = 'CliProbeError';
}

export class CliRuntimeError extends Error {
	override readonly name = 'CliRuntimeError';
	constructor(
		public readonly exitCode: number,
		message: string,
	) {
		super(message);
	}
}

export class MalformedOutputError extends Error {
	override readonly name = 'MalformedOutputError';
	constructor(public readonly output: string) {
		super('CLI output was not valid JSON.');
	}
}

function extractVersion(value: string): string | undefined {
	const match = value.match(/\b(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\b/);
	if (!match) return undefined;
	return valid(match[0]) ?? undefined;
}

function isExecutableNotFound(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error);
	return /(?:ENOENT|not found|could not find|executable)/i.test(message);
}

async function defaultExecute(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
	const { Command } = await import('@tauri-apps/plugin-shell');
	const result = await Command.create('atomize', args).execute();
	return { code: result.code, stdout: result.stdout, stderr: result.stderr };
}

export async function probeCli(execute: CliExecutor = defaultExecute): Promise<CliProbeResult> {
	let result: { code: number | null; stdout: string; stderr: string };
	try {
		result = await execute(['--version']);
	} catch (error) {
		if (isExecutableNotFound(error)) throw new CliAbsentError();
		throw new CliProbeError(error instanceof Error ? error.message : 'Unable to start Atomize CLI probe.');
	}
	if (result.code !== 0) {
		throw new CliProbeError(result.stderr || result.stdout || 'Atomize CLI version check failed.');
	}
	const version = extractVersion(result.stdout) ?? extractVersion(result.stderr);
	if (version === undefined) {
		throw new CliProbeError('Atomize CLI did not report a valid semantic version.');
	}
	if (version !== undefined && !gte(version, CLI_MINIMUM_VERSION)) {
		throw new CliVersionError(version, CLI_MINIMUM_VERSION);
	}
	return { version };
}

export async function invoke(args: string[], execute: CliExecutor = defaultExecute): Promise<unknown> {
	const result = await execute(args);
	if (result.code !== 0) {
		throw new CliRuntimeError(result.code ?? 1, result.stderr || result.stdout);
	}
	try {
		return JSON.parse(result.stdout) as unknown;
	} catch {
		throw new MalformedOutputError(result.stdout);
	}
}
