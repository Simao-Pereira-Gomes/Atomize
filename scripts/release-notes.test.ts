import { describe, expect, test } from "bun:test";
import { type Commit, noteForCommit, renderReleaseNotes } from "./release-notes.ts";

const commit = (over: Partial<Commit> = {}): Commit => ({
	shortHash: "abc1234",
	subject: "fix(cli): correct exit code",
	body: "",
	...over,
});

describe("renderReleaseNotes", () => {
	test("renders commit subjects as bullet lines with the short hash", () => {
		const md = renderReleaseNotes({
			commits: [commit(), commit({ shortHash: "def5678", subject: "feat(cli): add --json" })],
			compareUrl: "https://example.com/compare",
			surface: "cli",
		});
		expect(md).toContain("- fix(cli): correct exit code (abc1234)");
		expect(md).toContain("- feat(cli): add --json (def5678)");
		expect(md).toContain("**Full Changelog**: https://example.com/compare");
	});

	test("drops chore(release) version-bump commits", () => {
		const md = renderReleaseNotes({
			commits: [commit({ subject: "chore(release): bump cli to 4.0.1" })],
			compareUrl: "x",
			surface: "cli",
		});
		expect(md).not.toContain("bump cli");
		expect(md).toContain(`- Maintenance release (no user-facing changes)`);
	});

	test("a surface-scoped Release-Note trailer overrides the subject", () => {
		const md = renderReleaseNotes({
			commits: [
				commit({
					subject: "fix(studio,schema): stop Studio freezing on Review",
					body: [
						"Release-Note(cli): validate condition operators against the schema",
						"Release-Note(studio): stop freezing on Review",
					].join("\n"),
				}),
			],
			compareUrl: "x",
			surface: "cli",
		});
		expect(md).toContain("- validate condition operators against the schema (abc1234)");
		expect(md).not.toContain("Studio freezing");
	});

	test("a bare Release-Note trailer applies when no surface-scoped one matches", () => {
		const note = noteForCommit(commit({ subject: "s", body: "Release-Note: shared wording" }), "cli");
		expect(note.text).toBe("shared wording");
		expect(note.omit).toBe(false);
	});

	test("Release-Note(<surface>): skip omits the commit for that surface only", () => {
		const forCli = renderReleaseNotes({
			commits: [commit({ subject: "refactor(schema): internal rename", body: "Release-Note(cli): skip" })],
			compareUrl: "x",
			surface: "cli",
		});
		expect(forCli).toContain("- Maintenance release (no user-facing changes)");

		const forStudio = renderReleaseNotes({
			commits: [commit({ subject: "refactor(schema): internal rename", body: "Release-Note(cli): skip" })],
			compareUrl: "x",
			surface: "studio",
		});
		expect(forStudio).toContain("- refactor(schema): internal rename (abc1234)");
	});

	test("appends the Studio installer boilerplate when requested", () => {
		const md = renderReleaseNotes({
			commits: [commit()],
			compareUrl: "x",
			surface: "studio",
			studioBoilerplate: true,
		});
		expect(md).toContain("## Installer verification");
		expect(md).toContain("SHA256SUMS.txt");
	});

	test("omits the installer boilerplate by default", () => {
		const md = renderReleaseNotes({ commits: [commit()], compareUrl: "x", surface: "cli" });
		expect(md).not.toContain("Installer verification");
	});
});
