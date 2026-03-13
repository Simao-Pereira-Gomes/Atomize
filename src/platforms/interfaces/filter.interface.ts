import type { WorkItemType } from "./work-item.interface.ts";
/**
 * Filter criteria for querying work items
 */
export interface FilterCriteria {
	/** Override the team from config for this filter's queries */
	team?: string;

	/** Work item types to include */
	workItemTypes?: WorkItemType[];

	/** States to filter by */
	states?: string[];

	/** States to exclude */
	statesExclude?: string[];

	/** States the item was ever in */
	statesWereEver?: string[];

	/** Tag filtering */
	tags?: {
		include?: string[];
		exclude?: string[];
	};

	/** Area paths to filter by (exact match) */
	areaPaths?: string[];

	/** Area paths to filter by (includes descendants) */
	areaPathsUnder?: string[];

	/** Iterations to filter by (exact match) */
	iterations?: string[];

	/** Iterations to filter by (includes descendants) */
	iterationsUnder?: string[];

	/** Assigned to users */
	assignedTo?: string[];

	/** Priority range */
	priority?: {
		min?: number;
		max?: number;
	};

	/** Exclude work items that already have child tasks */
	excludeIfHasTasks?: boolean;

	/** Custom field filters */
	customFields?: CustomFieldFilter[];

	/** Platform-specific query string (escape hatch) */
	customQuery?: string;

	/** Date range filter */
	dateRange?: {
		field: string;
		from?: Date;
		to?: Date;
	};

	/** Filter by last changed date. Supports @Today macros (e.g. "@Today-7") */
	changedAfter?: string;

	/** Filter by creation date. Supports @Today macros (e.g. "@Today-30") */
	createdAfter?: string;

	/** Limit number of results */
	limit?: number;
}

/**
 * Custom field filter
 */
export interface CustomFieldFilter {
	field: string;
	operator: "equals" | "notEquals" | "contains" | "greaterThan" | "lessThan";
	value: string | number | boolean;
}

/**
 * Query result with metadata
 */
export interface QueryResult<T> {
	items: T[];
	totalCount: number;
	hasMore: boolean;
}
