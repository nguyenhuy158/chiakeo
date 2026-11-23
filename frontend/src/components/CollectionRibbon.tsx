import { CircleCheckBig } from "lucide-react";
import { Badge } from "../ui/Badge";

export const COLLECTION_RIBBON_LABEL = "Đã thu đủ";

export function CollectionRibbon() {
  return (
    <Badge
      tone="success"
      className="pointer-events-none absolute -top-2 right-2 border border-surface shadow-sm"
    >
      <CircleCheckBig size={11} aria-hidden="true" />
      {COLLECTION_RIBBON_LABEL}
    </Badge>
  );
}
