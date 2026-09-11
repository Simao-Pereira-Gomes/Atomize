#!/usr/bin/env bun
/**
 * Render GitHub Release notes for one release surface from the git commit log,
 * scoped to that surface's dependency-closure paths.
 *
 * Consumed by .github/workflows/publish-{cli,extension,studio}.yml. The `--paths`
 * list passed by each workflow must stay in sync with that workflow's
 * `on.push.paths` trigger.
 *
 * See docs/Releasing.md and
 * docs/adr/0063-release-notes-from-dependency-closure-commit-log.md.
 *
 * Usage:
 *   bun scripts/release-notes.ts \
 *     --tag-glob 'v[0-9]*' \
 *     --new-tag "v1.2.3" \
 *     --repo "owner/repo" \
 *     --surface cli \
 *     --paths packages/cli,packages/atomize-core,packages/atomize-schema,packages/atomize-ai \
 *     [--studio-boilerplate]
 *
 * Prints the release-notes markdown to stdout.
 */
import { parseArgs } from "node:util";
import { $ } from "bun";

const STUDIO_BOILERPLATE = `## Installer verification

Verify every download with \`SHA256SUMS.txt\`. macOS installers are ad-hoc signed but not notarised; Windows installers are unsigned. Your operating system may show a security warning before installation.`;

const EMPTY_LINE = "- Maintenance release (no user-facing changes)";

/** One commit, as read from `git log`. */
export interface Commit {
	shortHash: string;
	subject: string;
	body: string;
}

interface ReleaseNote {
	/** The line to show (without the leading `- ` or trailing hash). */
	text: string;
	/** True when an explicit `Release-Note(...): skip` opts this commit out. */
	omit: boolean;
}

/**
 * `Release-Note: <text>` or `Release-Note(<surface>): <text>`, one per line of a
 * commit body. A surface-scoped trailer wins over a bare one for that surface;
 * `skip` as the text drops the commit from that surface's notes.
 */
const TRAILER = /^Release-Note(?:\(([a-z][a-z-]*)\))?:[ \t]*(.+?)[ \t]*$/i;

/** `chore(release):` / `chore(release)!:` — the version-bump commits. */
const RELEASE_CHORE = /^chore\(release\)[!:]/i;

export function noteForCommit(commit: Commit, surface: string): ReleaseNote {
	let surfaceText: string | undefined;
	let bareText: string | undefined;
	for (const line of commit.body.split(/\r?\n/)) {
		const match = line.match(TRAILER);
		if (!match) continue;
		const [, scope, text] = match;
		if (scope === undefined) {
			bareText ??= text;
		} else if (scope.toLowerCase() === surface.toLowerCase()) {
			surfaceText ??= text;
		}
	}
	const text = surfaceText ?? bareText ?? commit.subject;
	return { text, omit: text.trim().toLowerCase() === "skip" };
}

export function renderReleaseNotes(opts: {
	commits: Commit[];
	compareUrl: string;
	surface: string;
	studioBoilerplate?: boolean;
}): string {
	const lines: string[] = [];
	for (const commit of opts.commits) {
		if (RELEASE_CHORE.test(commit.subject)) continue;
		const note = noteForCommit(commit, opts.surface);
		if (note.omit) continue;
		lines.push(`- ${note.text} (${commit.shortHash})`);
	}
	if (lines.length === 0) lines.push(EMPTY_LINE);

	const body = ["## What's Changed", "", ...lines, "", `**Full Changelog**: ${opts.compareUrl}`];
	if (opts.studioBoilerplate) body.push("", STUDIO_BOILERPLATE);
	return `${body.join("\n")}\n`;
}

async function readCommits(
	tagGlob: string,
	paths: string[],
): Promise<{ commits: Commit[]; lastTag: string | null }> {
	const tagsOut = await $`git tag -l ${tagGlob} --sort=-version:refname`.text();
	const lastTag = tagsOut.split(/\r?\n/).filter(Boolean)[0] ?? null;

	// Unit separator between fields, record separator between commits, so
	// multi-line bodies survive intact.
	const pretty = "--pretty=format:%h%x1f%s%x1f%b%x1e";
	const range = lastTag ? [`${lastTag}..HEAD`] : [];
	const raw = await $`git log ${range} --no-merges ${pretty} -- ${paths}`.text();

	const commits = raw
		.split("\x1e")
		.map((record) => record.replace(/^\r?\n/, ""))
		.filter((record) => record.trim().length > 0)
		.map((record) => {
			const [shortHash = "", subject = "", body = ""] = record.split("\x1f");
			return { shortHash: shortHash.trim(), subject: subject.trim(), body };
		});
	return { commits, lastTag };
}

function required(value: string | undefined, flag: string): string {
	if (!value) {
		console.error(`release-notes: missing required ${flag}`);
		process.exit(2);
	}
	return value;
}

if (import.meta.main) {
	const { values } = parseArgs({
		options: {
			"tag-glob": { type: "string" },
			"new-tag": { type: "string" },
			repo: { type: "string" },
			surface: { type: "string" },
			paths: { type: "string" },
			"studio-boilerplate": { type: "boolean", default: false },
		},
	});

	const tagGlob = required(values["tag-glob"], "--tag-glob");
	const newTag = required(values["new-tag"], "--new-tag");
	const repo = required(values.repo, "--repo");
	const surface = required(values.surface, "--surface");
	const paths = required(values.paths, "--paths")
		.split(",")
		.map((path) => path.trim())
		.filter(Boolean);

	const { commits, lastTag } = await readCommits(tagGlob, paths);
	const compareUrl = lastTag
		? `https://github.com/${repo}/compare/${lastTag}...${newTag}`
		: `https://github.com/${repo}/commits/${newTag}`;

	process.stdout.write(
		renderReleaseNotes({
			commits,
			compareUrl,
			surface,
			studioBoilerplate: values["studio-boilerplate"],
		}),
	);
}
