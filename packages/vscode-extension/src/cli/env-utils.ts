import { delimiter } from 'node:path';

function pathEnvKey(env: NodeJS.ProcessEnv): string {
	return Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH';
}

export function extendedEnv(): NodeJS.ProcessEnv {
	return buildExtendedEnv(process.env, process.platform);
}

export function buildExtendedEnv(env: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): NodeJS.ProcessEnv {
	const home = env.HOME ?? env.USERPROFILE ?? '';
	const pathSeparator = platform === 'win32' ? ';' : delimiter;
	const windowsNpmGlobal = platform === 'win32'
		? `${env.APPDATA ?? `${home}\\AppData\\Roaming`}\\npm`
		: null;
	const extra = [
		`${home}/.bun/bin`,
		`${home}/.npm-global/bin`,
		'/usr/local/bin',
		'/opt/homebrew/bin',
		...(windowsNpmGlobal ? [windowsNpmGlobal] : []),
	].join(pathSeparator);
	const key = pathEnvKey(env);
	return { ...env, [key]: `${extra}${pathSeparator}${env[key] ?? ''}` };
}
