const SILENCED_WARNING_CODES = new Set(["DEP0169"]);

export function silenceDependencyWarnings(target: Pick<NodeJS.Process, "emitWarning"> = process): void {
	const emitWarning = target.emitWarning.bind(target) as (...args: unknown[]) => void;
	target.emitWarning = ((warning: unknown, ...rest: unknown[]) => {
		// emitWarning(warning, { code }) or emitWarning(warning, type, code)
		const options = rest[0];
		const code = typeof options === "object" && options !== null ? (options as { code?: unknown }).code : rest[1];
		if (typeof code === "string" && SILENCED_WARNING_CODES.has(code)) return;
		emitWarning(warning, ...rest);
	}) as NodeJS.Process["emitWarning"];
}

silenceDependencyWarnings();
