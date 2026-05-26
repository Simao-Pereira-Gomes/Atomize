import { describe, expect, test } from "bun:test";

async function runCli(args: string[]) {
	const proc = Bun.spawn(["bun", "run", "src/cli/index.ts", ...args], {
		cwd: import.meta.dir.replace(/\/tests\/unit$/, ""),
		env: {
			...process.env,
			ATOMIZE_UPDATE_NOTIFIER: "false",
		},
		stdout: "pipe",
		stderr: "pipe",
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);

	return { stdout, stderr, exitCode };
}

describe("template resolve command", () => {
	test("prints composition errors in quiet mode for extension callers", async () => {
		const result = await runCli([
			"template",
			"resolve",
			"--quiet",
			"tests/fixtures/templates/circular-a.yaml",
		]);

		expect(result.exitCode).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("Composition failed: Circular inheritance detected");
	});
});
