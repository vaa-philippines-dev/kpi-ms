import { Badge } from "@/components/ui/badge";
import { PerformanceStatus } from "@/generated/prisma/enums";

const STATUS_TONE = {
  [PerformanceStatus.ON_TARGET]: "success",
  [PerformanceStatus.AT_RISK]: "warning",
  [PerformanceStatus.CRITICAL]: "danger",
  [PerformanceStatus.NO_DATA]: "neutral",
} as const;

const STATUS_LABEL = {
  [PerformanceStatus.ON_TARGET]: "On Target",
  [PerformanceStatus.AT_RISK]: "At Risk",
  [PerformanceStatus.CRITICAL]: "Critical",
  [PerformanceStatus.NO_DATA]: "No Data",
} as const;

export function StatusBadge({ status }: { status: PerformanceStatus }) {
  return <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}
