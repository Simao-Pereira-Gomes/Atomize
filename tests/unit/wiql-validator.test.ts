import { describe, expect, test } from "bun:test";
import { validateCustomQuery } from "@platforms/adapters/azure-devops/azure-devops.adapter";

const PROJECT = "MyProject";

describe("validateCustomQuery", () => {
	describe("structural validation", () => {
		test("accepts a valid SELECT FROM WorkItems query", () => {
			expect(() =>
				validateCustomQuery(
					`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${PROJECT}'`,
					PROJECT,
				),
			).not.toThrow();
		});

		test("rejects a non-SELECT statement", () => {
			expect(() =>
				validateCustomQuery(
					`UPDATE WorkItems SET [System.State] = 'Done'`,
					PROJECT,
				),
			).toThrow("SELECT statement targeting WorkItems");
		});

		test("rejects a query not targeting WorkItems", () => {
			expect(() =>
				validateCustomQuery(
					`SELECT [System.Id] FROM WorkItemLinks WHERE [System.TeamProject] = '${PROJECT}'`,
					PROJECT,
				),
			).toThrow("SELECT statement targeting WorkItems");
		});

		test("rejects an empty string", () => {
			expect(() => validateCustomQuery("", PROJECT)).toThrow(
				"SELECT statement targeting WorkItems",
			);
		});
	});

	describe("project scoping", () => {
		test("accepts query with exact project name constraint", () => {
			expect(() =>
				validateCustomQuery(
					`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${PROJECT}' AND [System.State] = 'Active'`,
					PROJECT,
				),
			).not.toThrow();
		});

		test("accepts query with @project macro", () => {
			expect(() =>
				validateCustomQuery(
					`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project`,
					PROJECT,
				),
			).not.toThrow();
		});

		test("accepts query with @Project macro (different casing)", () => {
			expect(() =>
				validateCustomQuery(
					`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @Project`,
					PROJECT,
				),
			).not.toThrow();
		});

		test("rejects query missing [System.TeamProject] constraint", () => {
			expect(() =>
				validateCustomQuery(
					`SELECT [System.Id] FROM WorkItems WHERE [System.State] = 'Active'`,
					PROJECT,
				),
			).toThrow("[System.TeamProject]");
		});

		test("rejects query constraining to a different project", () => {
			expect(() =>
				validateCustomQuery(
					`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = 'OtherProject'`,
					PROJECT,
				),
			).toThrow("[System.TeamProject]");
		});

		test("handles project names with regex special characters", () => {
			const specialProject = "My.Project(v2)";
			expect(() =>
				validateCustomQuery(
					`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = 'My.Project(v2)'`,
					specialProject,
				),
			).not.toThrow();
		});

		test("handles project names with single quotes (WIQL-escaped as double quotes)", () => {
			const quotedProject = "O'Brien";
			expect(() =>
				validateCustomQuery(
					`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = 'O''Brien'`,
					quotedProject,
				),
			).not.toThrow();
		});

		test("rejects unescaped single-quoted project name for a project containing a quote", () => {
			const quotedProject = "O'Brien";
			expect(() =>
				validateCustomQuery(
					`SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = 'O'Brien'`,
					quotedProject,
				),
			).toThrow("[System.TeamProject]");
		});
	});
});
