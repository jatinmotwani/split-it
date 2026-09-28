import {
  BedDouble,
  Car,
  Fuel,
  Gift,
  HandHelping,
  HeartPulse,
  House,
  Lightbulb,
  Plane,
  ReceiptText,
  ShoppingBag,
  ShoppingBasket,
  Tag,
  Ticket,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

const ICONS: Record<string, LucideIcon> = {
  food: UtensilsCrossed,
  groceries: ShoppingBasket,
  transport: Car,
  travel: Plane,
  stay: BedDouble,
  rent: House,
  utilities: Lightbulb,
  household: HandHelping,
  fuel: Fuel,
  shopping: ShoppingBag,
  entertainment: Ticket,
  health: HeartPulse,
  gifts: Gift,
  other: Tag,
};

export function CategoryIcon({
  category,
  className,
}: {
  category: string | null | undefined;
  className?: string;
}) {
  const Icon = (category && ICONS[category]) || ReceiptText;
  return <Icon className={className} aria-hidden />;
}
