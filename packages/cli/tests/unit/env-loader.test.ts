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
	test("loads a valid ATOMIZE_PAT into process.env", () => {
		writeFileSync(ENV_FILE, "ATOMIZE_PAT=my-token\n");
		delete process.env.ATOMIZE_PAT;

		loadEnvFile(ENV_FILE);

		expect(process.env.ATOMIZE_PAT as unknown as string).toBe("my-token");
		delete process.env.ATOMIZE_PAT;
	});

	test("shell env takes precedence — does not overwrite existing vars", () => {
		writeFileSync(ENV_FILE, "ATOMIZE_PROFILE=from-file\n");
		process.env.ATOMIZE_PROFILE = "from-shell";

		loadEnvFile(ENV_FILE);

		expect(process.env.ATOMIZE_PROFILE as unknown as string).toBe("from-shell");
		delete process.env.ATOMIZE_PROFILE;
	});

	test("strips double-quoted values", () => {
		writeFileSync(ENV_FILE, 'ATOMIZE_PAT="my-quoted-token"\n');
		delete process.env.ATOMIZE_PAT;

		loadEnvFile(ENV_FILE);

		expect(process.env.ATOMIZE_PAT as unknown as string).toBe("my-quoted-token");
		delete process.env.ATOMIZE_PAT;
	});

	test("strips single-quoted values", () => {
		writeFileSync(ENV_FILE, "ATOMIZE_PAT='my-single-token'\n");
		delete process.env.ATOMIZE_PAT;

		loadEnvFile(ENV_FILE);

		expect(process.env.ATOMIZE_PAT as unknown as string).toBe("my-single-token");
		delete process.env.ATOMIZE_PAT;
	});

	test("skips comment lines", () => {
		writeFileSync(ENV_FILE, "# this is a comment\nATOMIZE_PAT=token\n");
		delete process.env.ATOMIZE_PAT;

		loadEnvFile(ENV_FILE);

		expect(process.env.ATOMIZE_PAT as unknown as string).toBe("token");
		delete process.env.ATOMIZE_PAT;
	});

	test("skips empty lines", () => {
		writeFileSync(ENV_FILE, "\n\nATOMIZE_PAT=token\n\n");
		delete process.env.ATOMIZE_PAT;

		loadEnvFile(ENV_FILE);

		expect(process.env.ATOMIZE_PAT as unknown as string).toBe("token");
		delete process.env.ATOMIZE_PAT;
	});

	test("skips lines without an equals sign", () => {
		writeFileSync(ENV_FILE, "INVALID_LINE\nATOMIZE_PAT=token\n");
		delete process.env.ATOMIZE_PAT;

		loadEnvFile(ENV_FILE);

		expect(process.env.ATOMIZE_PAT as unknown as string).toBe("token");
		delete process.env.ATOMIZE_PAT;
	});

	test("allows = in values (PAT tokens often contain =)", () => {
		writeFileSync(ENV_FILE, "ATOMIZE_PAT=a=b=c\n");
		delete process.env.ATOMIZE_PAT;

		loadEnvFile(ENV_FILE);

		expect(process.env.ATOMIZE_PAT as unknown as string).toBe("a=b=c");
		delete process.env.ATOMIZE_PAT;
	});

	test("accepts all schema keys together", () => {
		writeFileSync(
			ENV_FILE,
			"ATOMIZE_PAT=token\nATOMIZE_PROFILE=dev\nATOMIZE_DEV=true\nATOMIZE_UPDATE_NOTIFIER=disabled\nLOG_LEVEL=debug\n",
		);
		delete process.env.ATOMIZE_PAT;
		delete process.env.ATOMIZE_PROFILE;
		delete process.env.ATOMIZE_DEV;
		delete process.env.ATOMIZE_UPDATE_NOTIFIER;
		delete process.env.LOG_LEVEL;

		loadEnvFile(ENV_FILE);

		expect(process.env.ATOMIZE_PAT as unknown as string).toBe("token");
		expect(process.env.ATOMIZE_PROFILE as unknown as string).toBe("dev");
		expect(process.env.ATOMIZE_DEV as unknown as string).toBe("true");
		expect(process.env.ATOMIZE_UPDATE_NOTIFIER as unknown as string).toBe("disabled");
		expect(process.env.LOG_LEVEL as unknown as string).toBe("debug");

		delete process.env.ATOMIZE_PAT;
		delete process.env.ATOMIZE_PROFILE;
		delete process.env.ATOMIZE_DEV;
		delete process.env.ATOMIZE_UPDATE_NOTIFIER;
		delete process.env.LOG_LEVEL;
	});

	test("rejects unknown keys with a clear error listing allowed keys", () => {
		writeFileSync(ENV_FILE, "AWS_SECRET_ACCESS_KEY=hunter2\n");

		expect(() => loadEnvFile(ENV_FILE)).toThrow("AWS_SECRET_ACCESS_KEY");
		expect(() => loadEnvFile(ENV_FILE)).toThrow("Allowed keys:");
	});

	test("rejects an invalid ATOMIZE_DEV value", () => {
		writeFileSync(ENV_FILE, "ATOMIZE_DEV=yes\n");

		expect(() => loadEnvFile(ENV_FILE)).toThrow("ATOMIZE_DEV");
	});

	test("rejects invalid ATOMIZE_UPDATE_NOTIFIER values", () => {
		writeFileSync(ENV_FILE, "ATOMIZE_UPDATE_NOTIFIER=false\n");

		expect(() => loadEnvFile(ENV_FILE)).toThrow("ATOMIZE_UPDATE_NOTIFIER");
	});

	test("rejects an invalid LOG_LEVEL value", () => {
		writeFileSync(ENV_FILE, "LOG_LEVEL=verbose\n");

		expect(() => loadEnvFile(ENV_FILE)).toThrow("LOG_LEVEL");
	});

	test("throws a clear error when file does not exist", () => {
		expect(() => loadEnvFile(join(TEST_DIR, "nonexistent.env"))).toThrow(
			"Env file not found:",
		);
	});

	test("resolves relative paths", () => {
		writeFileSync(ENV_FILE, "ATOMIZE_PAT=resolved\n");
		delete process.env.ATOMIZE_PAT;

		const cwd = process.cwd();
		process.chdir(TEST_DIR);
		try {
			loadEnvFile(".env");
			expect(process.env.ATOMIZE_PAT as unknown as string).toBe("resolved");
		} finally {
			process.chdir(cwd);
			delete process.env.ATOMIZE_PAT;
		}
	});
});
