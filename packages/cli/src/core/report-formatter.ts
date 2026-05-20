import { chmod, writeFile } from "node:fs/promises";
import type { AtomizationReport, StoryAtomizationResult } from "@core/atomizer";
import type { WorkItem } from "@platforms/interfaces/work-item.interface";

function sanitizeWorkItem(item: WorkItem): WorkItem {
  const { description: _d, customFields: _cf, platformSpecific: _ps, children, ...safe } = item;
  return children ? { ...safe, children: children.map(sanitizeWorkItem) } : safe;
}

export function sanitizeReport(report: AtomizationReport): AtomizationReport {
  return {
    ...report,
    results: report.results.map((result: StoryAtomizationResult) => ({
      ...result,
      story: sanitizeWorkItem(result.story),
      tasksCreated: result.tasksCreated.map(sanitizeWorkItem),
    })),
  };
}

export async function writeReportFile(
  outputPath: string,
  report: AtomizationReport,
  includeSensitiveReportData: boolean,
): Promise<void> {
  const reportToWrite = includeSensitiveReportData ? report : sanitizeReport(report);
  await writeFile(outputPath, JSON.stringify(reportToWrite, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });

  // Windows file permissions are ACL-based; chmod/stat POSIX mode bits are not reliable there.
  if (process.platform !== "win32") {
    await chmod(outputPath, 0o600);
  }
}
