export function extendedEnv(): NodeJS.ProcessEnv {
	const home = process.env.HOME ?? '';
	const extra = [
		`${home}/.bun/bin`,
		`${home}/.npm-global/bin`,
		'/usr/local/bin',
		'/opt/homebrew/bin',
	].join(':');
	return { ...process.env, PATH: `${extra}:${process.env.PATH ?? ''}` };
}
