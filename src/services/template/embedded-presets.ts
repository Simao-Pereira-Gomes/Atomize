/**
 * Embedded preset templates
 * These are bundled with the code to ensure they're always available
 * regardless of how the package is installed or distributed
 */

export const EMBEDDED_PRESETS = {
  "backend-api": `version: "1.0"
name: "Backend API Development"
description: "Standard backend API development with database integration"
author: "Atomize"
tags: ["backend", "api", "database"]

filter:
  workItemTypes: ["User Story"]
  states: ["New", "Active", "Approved"]
  tags:
    include: ["backend", "api"]
  excludeIfHasTasks: true

tasks:
  - title: "Design API Endpoints: \${story.title}"
    description: "Design REST API endpoints, request/response schemas, and error handling"
    estimationPercent: 15
    activity: "Design"
    tags: ["design", "api"]

  - title: "Database Schema: \${story.title}"
    description: "Design and create database tables, migrations, and relationships"
    estimationPercent: 15
    activity: "Design"
    tags: ["database", "migration"]

  - title: "Implement Core Logic: \${story.title}"
    description: "Implement business logic, data validation, and error handling"
    estimationPercent: 35
    activity: "Development"
    tags: ["implementation"]

  - title: "Write Unit Tests"
    description: "Unit tests for services, repositories, and utilities"
    estimationPercent: 15
    activity: "Testing"
    tags: ["testing", "unit-tests"]

  - title: "Integration Tests & Documentation"
    description: "API integration tests and OpenAPI/Swagger documentation"
    estimationPercent: 10
    activity: "Testing"
    tags: ["testing", "documentation"]

  - title: "Code Review & Refinement"
    description: "Address code review feedback and refactor as needed"
    estimationPercent: 10
    activity: "Documentation"
    tags: ["review"]

estimation:
  strategy: "percentage"
  rounding: "nearest"
  minimumTaskPoints: 0

metadata:
  category: "Backend"
  difficulty: "intermediate"
  recommendedFor: ["API development", "Microservices", "REST APIs"]
  estimationGuidelines: "Based on typical backend development workflows"
`,

  "frontend-feature": `version: "1.0"
name: "Frontend Feature Development"
description: "UI/UX feature development with React/Vue components"
author: "Atomize"
tags: ["frontend", "ui", "react"]

filter:
  workItemTypes: ["User Story"]
  states: ["New", "Active", "Approved"]
  tags:
    include: ["frontend", "ui"]
  excludeIfHasTasks: true

tasks:
  - title: "UI/UX Design: \${story.title}"
    description: "Create wireframes, mockups, and component designs"
    estimationPercent: 15
    activity: "Design"
    tags: ["design", "ui"]

  - title: "Component Implementation: \${story.title}"
    description: "Build React/Vue components with proper state management"
    estimationPercent: 40
    activity: "Development"
    tags: ["implementation", "react"]

  - title: "Styling & Responsiveness"
    description: "CSS/Tailwind styling and responsive design for mobile/tablet"
    estimationPercent: 20
    activity: "Development"
    tags: ["css", "responsive"]

  - title: "Unit & Component Tests"
    description: "Jest/React Testing Library tests for components"
    estimationPercent: 15
    activity: "Testing"
    tags: ["testing"]

  - title: "Code Review & Accessibility"
    description: "Review, accessibility improvements, and polish"
    estimationPercent: 10
    activity: "Documentation"
    tags: ["review", "a11y"]

estimation:
  strategy: "percentage"
  rounding: "nearest"

metadata:
  category: "Frontend"
  difficulty: "intermediate"
  recommendedFor: ["React", "Vue", "UI components"]
`,

  "bug-fix": `version: "1.0"
name: "Bug Fix"
description: "Standard bug investigation and resolution workflow"
author: "Atomize"
tags: ["bug", "fix"]

filter:
  workItemTypes: ["Bug"]
  states: ["New", "Active", "Approved"]
  excludeIfHasTasks: true

tasks:
  - title: "Investigate & Reproduce: \${story.title}"
    description: "Investigate root cause and create reproduction steps"
    estimationPercent: 30
    activity: "Development"
    tags: ["investigation"]

  - title: "Implement Fix: \${story.title}"
    description: "Fix the bug and ensure no regressions"
    estimationPercent: 40
    activity: "Development"
    tags: ["implementation"]

  - title: "Test & Verify"
    description: "Verify fix works and add regression tests"
    estimationPercent: 20
    activity: "Testing"
    tags: ["testing", "verification"]

  - title: "Review & Deploy"
    description: "Code review and prepare for deployment"
    estimationPercent: 10
    activity: "Documentation"
    tags: ["review"]

estimation:
  strategy: "percentage"
  rounding: "nearest"

metadata:
  category: "Maintenance"
  difficulty: "beginner"
  recommendedFor: ["Bug fixes", "Hotfixes", "Production issues"]
`,
} as const;

export type PresetName = keyof typeof EMBEDDED_PRESETS;

export const PRESET_NAMES = Object.keys(EMBEDDED_PRESETS) as PresetName[];
