import type { ClientDish } from "../client-platform/types";
import type { CombinedOrderAddonItemInput } from "../../shared/api/combinedOrderApi";

export type AddonCartLine = {
  readonly productId: string;
  readonly quantity: number;
};

const normalizedMinimum = (dish: ClientDish) =>
  Math.max(1, Math.floor(dish.minimumQuantity || 1));
const normalizedStep = (dish: ClientDish) =>
  Math.max(1, Math.floor(dish.quantityStep || 1));

export const updateAddonCartLine = (
  lines: readonly AddonCartLine[],
  dish: ClientDish,
  direction: 1 | -1,
): readonly AddonCartLine[] => {
  const current =
    lines.find((line) => line.productId === dish.id)?.quantity ?? 0;
  const minimum = normalizedMinimum(dish);
  const step = normalizedStep(dish);
  const next =
    current === 0 && direction > 0 ? minimum : current + direction * step;
  if (next < minimum) return lines.filter((line) => line.productId !== dish.id);
  const maximum = dish.isUnlimited
    ? Number.MAX_SAFE_INTEGER
    : Math.max(0, Math.floor(dish.stockQuantity));
  const clamped = Math.min(next, maximum);
  if (clamped < minimum || clamped === current) return lines;
  return [
    ...lines.filter((line) => line.productId !== dish.id),
    { productId: dish.id, quantity: clamped },
  ];
};

export const toCombinedOrderAddonItems = (
  lines: readonly AddonCartLine[],
  dishes: readonly ClientDish[],
): readonly CombinedOrderAddonItemInput[] =>
  lines.flatMap((line) => {
    const dish = dishes.find((item) => item.id === line.productId);
    if (!dish) return [];
    return [
      {
        productId: dish.id,
        quantity: dish.saleUnit === "weight" ? 1 : line.quantity,
        ...(dish.saleUnit === "weight"
          ? { requestedQuantity: line.quantity }
          : {}),
      },
    ];
  });

export const calculateAddonCartSubtotal = (
  lines: readonly AddonCartLine[],
  dishes: readonly ClientDish[],
) =>
  lines.reduce((total, line) => {
    const dish = dishes.find((item) => item.id === line.productId);
    if (!dish) return total;
    return (
      total +
      Math.round(
        (dish.price * line.quantity) / Math.max(1, dish.priceBasisQuantity),
      )
    );
  }, 0);
