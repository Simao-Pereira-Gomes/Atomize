import { describe, expect, it } from 'bun:test';
import { parse } from 'yaml';
import { catalogRefFor, improvedCopyContent, reviewMessage } from '../ai/improvement-proposal.js';

const PROPOSAL = `# My comment
version: "1.0"
name: Backend API
origin: template:base
extends: template:base
filter:
  workItemTypes: ["User Story"]
tasks:
  - title: Build
    estimationPercent: 100
`;

describe('improvedCopyContent', () => {
	it('opens as an Atomize YAML File named as improved, with the Catalog source as origin', () => {
		const content = improvedCopyContent(PROPOSAL, 'template:backend-api');
		expect(content.split('\n')[0]).toBe('# atomize-yaml');
		const copy = parse(content);
		expect(copy.name).toBe('Backend API (improved)');
		expect(copy.origin).toBe('template:backend-api');
		expect(copy.extends).toBe('template:base');
	});

	it('leaves out origin for a standalone file', () => {
		expect(parse(improvedCopyContent(PROPOSAL, undefined))).not.toHaveProperty('origin');
	});
});

describe('catalogRefFor', () => {
	const items = [
		{ kind: 'template', path: '/cat/backend.yaml', ref: 'template:backend' },
		{ kind: 'mixin', path: '/cat/review.yaml', ref: 'mixin:review' },
	];

	it('finds the Catalog Template stored at a path', () => {
		expect(catalogRefFor('/cat/backend.yaml', items)).toBe('template:backend');
	});

	it('finds nothing for a standalone file or a Mixin', () => {
		expect(catalogRefFor('/repo/mine.atomize.yaml', items)).toBeUndefined();
		expect(catalogRefFor('/cat/review.yaml', items)).toBeUndefined();
	});
});

describe('reviewMessage', () => {
	it('explains how to finish the review and lists notes and remaining problems', () => {
		const message = reviewMessage(['Added a review task.'], ['tasks.0.title: Required']);
		expect(message).toContain('Accept, Save as New Template, or Reject');
		expect(message).toContain("Copilot's notes: Added a review task.");
		expect(message).toContain('Still to fix: tasks.0.title: Required');
	});

	it('mentions only what there is', () => {
		const message = reviewMessage([], []);
		expect(message).not.toContain('notes');
		expect(message).not.toContain('Still to fix');
	});
});
