export const websiteUrl = "https://atomize-docs.pages.dev";

/** Website route for each Template Reference heading anchor. Kept in step with the website's canonical sections by a test. */
const routes: Record<string, string> = {
	"file-naming": "/reference/templates/#file-naming",
	"option-1-atomizeyaml-extension-recommended": "/reference/templates/#option-1-atomizeyaml-extension-recommended",
	"option-1--atomizeyaml-extension-recommended": "/reference/templates/#option-1--atomizeyaml-extension-recommended",
	"option-2-modeline": "/reference/templates/#option-2-modeline",
	"option-2--modeline": "/reference/templates/#option-2--modeline",
	"content-detection-fallback": "/reference/templates/#content-detection-fallback",
	"overview": "/reference/templates/",
	"file-identity": "/reference/templates/#file-identity",
	"filter": "/reference/templates/filter/",
	"special-values": "/reference/templates/filter/#special-values",
	"date-filters": "/reference/templates/filter/#date-filters",
	"area-paths-exact-vs-descendants": "/reference/templates/filter/#area-paths-exact-vs-descendants",
	"iterations-exact-vs-descendants": "/reference/templates/filter/#iterations-exact-vs-descendants",
	"savedquery": "/reference/templates/filter/#savedquery",
	"tasks": "/reference/templates/tasks/",
	"variable-interpolation": "/reference/templates/tasks/#variable-interpolation",
	"assignment-patterns": "/reference/templates/tasks/#assignment-patterns",
	"task-custom-fields": "/reference/templates/tasks/#task-custom-fields",
	"task-dependencies": "/reference/templates/tasks/#task-dependencies",
	"repeated-tasks": "/reference/templates/tasks/#repeated-tasks",
	"conditional-tasks": "/reference/templates/conditions/",
	"conditional-estimation": "/reference/templates/conditions/#conditional-estimation",
	"reuse-conditions-with-yaml-anchors": "/reference/templates/conditions/#reuse-conditions-with-yaml-anchors",
	"estimation": "/reference/templates/estimation/",
	"estimation-terms": "/reference/templates/estimation/#estimation-terms",
	"from-story-estimate-to-task-estimate": "/reference/templates/estimation/#from-story-estimate-to-task-estimate",
	"unresolvable-story-estimates": "/reference/templates/estimation/#unresolvable-story-estimates",
	"estimation-field-mapping": "/reference/templates/estimation/#estimation-field-mapping",
	"check-estimation-against-your-project": "/reference/templates/estimation/#check-estimation-against-your-project",
	"validation": "/reference/templates/validation/",
	"metadata": "/reference/templates/validation/#metadata",
	"deprecated-fields": "/reference/templates/validation/#deprecated-fields",
	"complete-example": "/reference/templates/example/",
	"composition": "/reference/templates/composition/",
	"inheritance-extends": "/reference/templates/composition/#inheritance-extends",
	"mixins-mixins": "/reference/templates/composition/#mixins-mixins",
	"resolution-order": "/reference/templates/composition/#resolution-order",
	"inspect-composition-in-your-tool": "/reference/templates/composition/#inspect-composition-in-your-tool",
	"compatibility": "/reference/templates/composition/#compatibility",
};

/** The website page for a Template Reference anchor, or the Template Reference overview when there is none. */
export function websiteGuideUrl(anchor?: string): string {
	return `${websiteUrl}${(anchor && routes[anchor]) || "/reference/templates/"}`;
}
