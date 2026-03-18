import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadEnvFile } from "../../src/cli/env-loader";

const TEST_DIR = join(tmpdir(), `atomize-env-loader-test-${process.pid}`);
const ENV_FILE = join(TEST_DIR, ".env");

beforeEach(() => {
	mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("loadEnvFile", () => {
	test("loads basic KEY=VALUE pairs into process.env", () => {
		writeFileSync(ENV_FILE, "TEST_LOAD_KEY=hello\n");
		delete process.env.TEST_LOAD_KEY;

		loadEnvFile(ENV_FILE);

		expect(process.env.TEST_LOAD_KEY as unknown as string).toBe("hello");
		delete process.env.TEST_LOAD_KEY;
	});

	test("shell env takes precedence — does not overwrite existing vars", () => {
		writeFileSync(ENV_FILE, "TEST_PRECEDENCE_KEY=from-file\n");
		process.env.TEST_PRECEDENCE_KEY = "from-shell";

		loadEnvFile(ENV_FILE);

		expect(process.env.TEST_PRECEDENCE_KEY as unknown as string).toBe("from-shell");
		delete process.env.TEST_PRECEDENCE_KEY;
	});

	test("strips double-quoted values", () => {
		writeFileSync(ENV_FILE, 'TEST_QUOTED_KEY="quoted value"\n');
		delete process.env.TEST_QUOTED_KEY;

		loadEnvFile(ENV_FILE);

		expect(process.env.TEST_QUOTED_KEY as unknown as string).toBe("quoted value");
		delete process.env.TEST_QUOTED_KEY;
	});

	test("strips single-quoted values", () => {
		writeFileSync(ENV_FILE, "TEST_SINGLE_KEY='single quoted'\n");
		delete process.env.TEST_SINGLE_KEY;

		loadEnvFile(ENV_FILE);

		expect(process.env.TEST_SINGLE_KEY as unknown as string).toBe("single quoted");
		delete process.env.TEST_SINGLE_KEY;
	});

	test("skips comment lines", () => {
		writeFileSync(ENV_FILE, "# this is a comment\nTEST_COMMENT_KEY=value\n");
		delete process.env.TEST_COMMENT_KEY;

		loadEnvFile(ENV_FILE);

		expect(process.env.TEST_COMMENT_KEY as unknown as string).toBe("value");
		delete process.env.TEST_COMMENT_KEY;
	});

	test("skips empty lines", () => {
		writeFileSync(ENV_FILE, "\n\nTEST_EMPTY_LINE_KEY=value\n\n");
		delete process.env.TEST_EMPTY_LINE_KEY;

		loadEnvFile(ENV_FILE);

		expect(process.env.TEST_EMPTY_LINE_KEY as unknown as string).toBe("value");
		delete process.env.TEST_EMPTY_LINE_KEY;
	});

	test("skips lines without an equals sign", () => {
		writeFileSync(ENV_FILE, "INVALID_LINE\nTEST_VALID_KEY=valid\n");
		delete process.env.TEST_VALID_KEY;

		loadEnvFile(ENV_FILE);

		expect(process.env.TEST_VALID_KEY as unknown as string).toBe("valid");
		delete process.env.TEST_VALID_KEY;
	});

	test("allows = in values", () => {
		writeFileSync(ENV_FILE, "TEST_EQ_VAL=a=b=c\n");
		delete process.env.TEST_EQ_VAL;

		loadEnvFile(ENV_FILE);

		expect(process.env.TEST_EQ_VAL as unknown as string).toBe("a=b=c");
		delete process.env.TEST_EQ_VAL;
	});

	test("throws a clear error when file does not exist", () => {
		expect(() => loadEnvFile(join(TEST_DIR, "nonexistent.env"))).toThrow(
			"Env file not found:",
		);
	});

	test("resolves relative paths", () => {
		writeFileSync(ENV_FILE, "TEST_RELATIVE_KEY=resolved\n");
		delete process.env.TEST_RELATIVE_KEY;

		// Pass a relative path — loadEnvFile should resolve it
		const cwd = process.cwd();
		process.chdir(TEST_DIR);
		try {
			loadEnvFile(".env");
			expect(process.env.TEST_RELATIVE_KEY as unknown as string).toBe("resolved");
		} finally {
			process.chdir(cwd);
			delete process.env.TEST_RELATIVE_KEY;
		}
	});
});
