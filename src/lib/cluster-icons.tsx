import {
  PenLine,
  ListChecks,
  HeartPulse,
  Headset,
  Percent,
  Users,
  Package,
  ClipboardList,
  ShoppingCart,
  Boxes,
  Truck,
  Warehouse,
  Briefcase,
  Palette,
  BadgeCheck,
  MessageCircle,
  FolderOpen,
  Link as LinkIcon,
  Banknote,
  BarChart3,
  EyeOff,
  Tags,
  Repeat,
  Video,
  Store,
  Mic,
  Cog,
  Copy,
  Layers,
  type LucideIcon,
} from "lucide-react";
import {
  FaFacebook,
  FaInstagram,
  FaPinterest,
  FaReddit,
  FaTiktok,
  FaYoutube,
  FaAmazon,
  FaEbay,
} from "react-icons/fa6";
import type { IconType } from "react-icons";

// Keyed by the exact `cluster` string stored on KpiDefinition — free text,
// not an enum, so this map is best-effort: anything not listed here (a new
// cluster added later, typos, etc.) falls back to a generic icon rather
// than crashing or rendering blank.
const CLUSTER_ICONS: Record<string, LucideIcon | IconType> = {
  // Social Media
  Amazon: FaAmazon,
  "Amazon Creator Connections": FaAmazon,
  Copywriter: PenLine,
  Facebook: FaFacebook,
  Instagram: FaInstagram,
  Pinterest: FaPinterest,
  Reddit: FaReddit,
  "Social Media - Task-based": ListChecks,
  Tiktok: FaTiktok,
  "Tiktok Shop": FaTiktok,
  Youtube: FaYoutube,

  // Amazon
  "Account Health Rating (AHR)": HeartPulse,
  "Amazon - Task-based": ListChecks,
  "Customer Service Management": Headset,
  "Deals and Promotions": Percent,
  "Engagement and Participation": Users,
  "Inventory Management": Package,
  "Listing Optimization": ClipboardList,
  "Order Management": ShoppingCart,
  "Product Sourcing": Boxes,
  "Shipping and Delivery": Truck,

  // Wholesale
  Wholesale: Warehouse,
  "Wholesale - Task-based": ListChecks,

  // PPC
  "Amazon PPC": FaAmazon,
  "PPC - Task-based": ListChecks,
  "Walmart PPC": Store,

  // Executive Assistant
  "Customer Relations & Support": Headset,
  "EA Admin & Business Support": Briefcase,
  "Production Artist": Palette,
  "Quality Assurance": BadgeCheck,
  "Technical, Logistics & E-commerce": Cog,
  "Voice & Governance": Mic,

  // Walmart
  "Account Health": BadgeCheck,
  "Buyer Messages": MessageCircle,
  "Case Management": FolderOpen,
  "Channel Advisor / Rithium": Cog,
  eBay: FaEbay,
  "Inventory Accuracy": Package,
  Levanta: LinkIcon,
  "Listing Creation and Optimization": ClipboardList,
  "Listing Mirror": Copy,
  Reimbursements: Banknote,
  Reports: BarChart3,
  Suppressions: EyeOff,
  "Temu Product Attributes": Tags,
  Walmart: Store,
  "WFS Conversion": Repeat,
  "WFS Shipments": Truck,

  // Creatives
  "Graphic Design": Palette,
  "Video Editing": Video,
};

const DEFAULT_ICON: LucideIcon | IconType = Layers;

/** Looks up the icon for a cluster's exact string, trimmed to tolerate the
 * odd stray whitespace some legacy-imported cluster values carry. */
export function getClusterIcon(cluster: string): LucideIcon | IconType {
  return CLUSTER_ICONS[cluster.trim()] ?? DEFAULT_ICON;
}
