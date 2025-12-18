import type { WorkItem } from "@platforms/interfaces/work-item.interface";

/**
 * Mock user stories for testing
 */
export const mockUserStories: WorkItem[] = [
  {
    id: "STORY-001",
    title: "Implement user authentication API",
    type: "User Story",
    state: "New",
    assignedTo: "john.doe@company.com",
    estimation: 8,
    tags: ["backend", "api", "security"],
    description:
      "As a user, I want to be able to login securely so that I can access my account",
    areaPath: "MyProject\\Backend",
    iteration: "Sprint 23",
    priority: 1,
    customFields: {
      "Custom.Team": "Platform Engineering",
      "Custom.Complexity": "High",
    },
    createdDate: new Date("2024-01-15"),
    updatedDate: new Date("2024-01-16"),
  },
  {
    id: "STORY-002",
    title: "Create user profile dashboard",
    type: "User Story",
    state: "Active",
    assignedTo: "jane.smith@company.com",
    estimation: 5,
    tags: ["frontend", "react", "ui"],
    description: "As a user, I want to view and edit my profile information",
    areaPath: "MyProject\\Frontend",
    iteration: "Sprint 23",
    priority: 2,
    customFields: {
      "Custom.Team": "UI Team",
      "Custom.Complexity": "Medium",
    },
    createdDate: new Date("2024-01-14"),
    updatedDate: new Date("2024-01-17"),
  },
  {
    id: "STORY-003",
    title: "Implement payment processing",
    type: "User Story",
    state: "New",
    assignedTo: "bob.johnson@company.com",
    estimation: 13,
    tags: ["backend", "api", "payment"],
    description: "As a user, I want to securely process payments",
    areaPath: "MyProject\\Backend",
    iteration: "Sprint 24",
    priority: 1,
    customFields: {
      "Custom.Team": "Platform Engineering",
      "Custom.Complexity": "Very High",
    },
    createdDate: new Date("2024-01-16"),
    updatedDate: new Date("2024-01-16"),
  },
  {
    id: "STORY-004",
    title: "Add search functionality",
    type: "User Story",
    state: "Approved",
    assignedTo: "alice.williams@company.com",
    estimation: 8,
    tags: ["fullstack", "search", "api", "frontend"],
    description: "As a user, I want to search for items quickly",
    areaPath: "MyProject\\Features",
    iteration: "Sprint 23",
    priority: 2,
    customFields: {
      "Custom.Team": "Search Team",
      "Custom.Complexity": "High",
    },
    createdDate: new Date("2024-01-10"),
    updatedDate: new Date("2024-01-18"),
  },
  {
    id: "STORY-005",
    title: "Optimize database queries",
    type: "User Story",
    state: "New",
    assignedTo: "charlie.brown@company.com",
    estimation: 3,
    tags: ["backend", "database", "performance"],
    description: "As a developer, I want faster query performance",
    areaPath: "MyProject\\Backend",
    iteration: "Sprint 24",
    priority: 3,
    customFields: {
      "Custom.Team": "Platform Engineering",
      "Custom.Complexity": "Medium",
    },
    createdDate: new Date("2024-01-17"),
    updatedDate: new Date("2024-01-17"),
  },
  {
    id: "STORY-006",
    title: "Mobile responsive design",
    type: "User Story",
    state: "New",
    assignedTo: "diana.martinez@company.com",
    estimation: 5,
    tags: ["frontend", "mobile", "css"],
    description: "As a mobile user, I want the app to work on my phone",
    areaPath: "MyProject\\Frontend",
    iteration: "Sprint 24",
    priority: 2,
    customFields: {
      "Custom.Team": "UI Team",
      "Custom.Complexity": "Medium",
    },
    createdDate: new Date("2024-01-18"),
    updatedDate: new Date("2024-01-18"),
  },
  {
    id: "STORY-007",
    title: "Implement data export feature",
    type: "User Story",
    state: "Active",
    assignedTo: "eve.davis@company.com",
    estimation: 8,
    tags: ["backend", "api", "export"],
    description: "As a user, I want to export my data to CSV/Excel",
    areaPath: "MyProject\\Backend",
    iteration: "Sprint 23",
    priority: 3,
    children: [
      {
        id: "TASK-101",
        title: "Design export API",
        type: "Task",
        state: "Done",
        estimation: 2,
        parentId: "STORY-007",
      },
    ],
    customFields: {
      "Custom.Team": "Platform Engineering",
      "Custom.Complexity": "High",
    },
    createdDate: new Date("2024-01-12"),
    updatedDate: new Date("2024-01-19"),
  },
];

/**
 * Get mock stories by filter
 */
export function getMockStoriesByTags(
  includeTags?: string[],
  excludeTags?: string[]
): WorkItem[] {
  let stories = [...mockUserStories];

  if (includeTags && includeTags.length > 0) {
    stories = stories.filter((story) => {
      return includeTags.some((tag) => story.tags?.includes(tag));
    });
  }

  if (excludeTags && excludeTags.length > 0) {
    stories = stories.filter((story) => {
      return !excludeTags.some((tag) => story.tags?.includes(tag));
    });
  }

  return stories;
}

/**
 * Get mock stories by state
 */
export function getMockStoriesByState(states: string[]): WorkItem[] {
  return mockUserStories.filter((story) => states.includes(story.state));
}

/**
 * Get mock story by ID
 */
export function getMockStoryById(id: string): WorkItem | undefined {
  return mockUserStories.find((story) => story.id === id);
}
