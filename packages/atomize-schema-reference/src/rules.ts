import type { SchemaTab } from "./tree";

export interface WholeFileRule {
	tab: SchemaTab;
	path: string;
	rules: readonly string[];
}

export const wholeFileRules: readonly WholeFileRule[] = [
	{
		tab: "template",
		path: "tasks",
		rules: [
			"Percentage validation uses lower and upper bounds. A task's bounds come from estimationPercent (0 when omitted) and every estimationPercentCondition percentage. A task without a condition contributes its lowest percentage to the lower total; a conditional task contributes 0. Every task contributes its highest percentage to the upper total. Each repeated copy contributes separately.",
			"validation.totalEstimationMustBe must lie between the lower and upper totals. When it is unset, validation.totalEstimationRange must overlap those bounds. Neither setting imposes an automatic 100% limit.",
			"Generated task counts include each repeated copy and must satisfy validation.minTasks and validation.maxTasks when set.",
			"Without an explicit total constraint, the sum of the written estimationPercent values, counting repeated copies, may exceed 100%. Unless estimation.normalize is always, this produces a non-blocking warning rather than a validation error, even in strict mode.",
		],
	},
];
