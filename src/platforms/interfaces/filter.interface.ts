import type { WorkItemType } from "./work-item.interface.ts";
/**
 * Filter criteria for querying work items
 */
export interface FilterCriteria {
	/** Work item types to include */
	workItemTypes?: WorkItemType[];

	/** States to filter by */
	states?: string[];

	/** Tag filtering */
	tags?: {
		include?: string[];
		exclude?: string[];
	};

	/** Area paths to filter by */
	areaPaths?: string[];

	/** Iterations to filter by */
	iterations?: string[];

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
