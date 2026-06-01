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
	const key = pathEnvKey(env);
	const original = env[key] ?? '';

	if (platform === 'win32') {
		// On Windows, VS Code inherits the full user PATH, so append %APPDATA%\npm as a
		// fallback only. Prepending would cause an older npm-installed version to shadow a
		// newer one installed via Scoop, Chocolatey, or a different npm prefix.
		const windowsNpmGlobal = `${env.APPDATA ?? `${home}\\AppData\\Roaming`}\\npm`;
		return { ...env, [key]: `${original}${pathSeparator}${windowsNpmGlobal}` };
	}

	// On macOS/Linux, VS Code's extension host may have a stripped PATH that omits
	// user-level bin directories, so prepend known locations as a priority override.
	const extra = [
		`${home}/.bun/bin`,
		`${home}/.npm-global/bin`,
		'/usr/local/bin',
		'/opt/homebrew/bin',
	].join(pathSeparator);
	return { ...env, [key]: `${extra}${pathSeparator}${original}` };
}
