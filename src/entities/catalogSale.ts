export type CatalogSaleUnit = 'piece' | 'weight';
export type CatalogQuantityUnit = 'piece' | 'gram';

export type CatalogSaleConfiguration = {
  saleUnit: CatalogSaleUnit;
  quantityUnit: CatalogQuantityUnit;
  priceBasisQuantity: number;
  minimumQuantity: number;
  quantityStep: number;
  stockQuantity: number;
  isUnlimited: boolean;
};

const wholeNonNegative = (value: number, fallback = 0) =>
  Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;

const wholePositive = (value: number, fallback: number) => {
  const normalized = wholeNonNegative(value, fallback);
  return normalized > 0 ? normalized : fallback;
};

export const normalizeCatalogSaleConfiguration = (
  value: CatalogSaleConfiguration
): CatalogSaleConfiguration => {
  if (value.saleUnit === 'piece') {
    return {
      saleUnit: 'piece',
      quantityUnit: 'piece',
      priceBasisQuantity: 1,
      minimumQuantity: 1,
      quantityStep: 1,
      stockQuantity: wholeNonNegative(value.stockQuantity),
      isUnlimited: value.isUnlimited
    };
  }

  return {
    saleUnit: 'weight',
    quantityUnit: 'gram',
    priceBasisQuantity: wholePositive(value.priceBasisQuantity, 1000),
    minimumQuantity: wholePositive(value.minimumQuantity, 100),
    quantityStep: wholePositive(value.quantityStep, 50),
    stockQuantity: wholeNonNegative(value.stockQuantity),
    isUnlimited: value.isUnlimited
  };
};

export const normalizeRequestedQuantity = (
  rawConfiguration: CatalogSaleConfiguration,
  requestedQuantity: number
) => {
  const configuration = normalizeCatalogSaleConfiguration(rawConfiguration);
  const requested = Number.isFinite(requestedQuantity)
    ? Math.max(configuration.minimumQuantity, Math.ceil(requestedQuantity))
    : configuration.minimumQuantity;
  const aligned = configuration.minimumQuantity
    + Math.ceil((requested - configuration.minimumQuantity) / configuration.quantityStep)
      * configuration.quantityStep;

  if (configuration.isUnlimited || aligned <= configuration.stockQuantity) return aligned;
  if (configuration.stockQuantity < configuration.minimumQuantity) return 0;

  return configuration.minimumQuantity
    + Math.floor(
      (configuration.stockQuantity - configuration.minimumQuantity) / configuration.quantityStep
    ) * configuration.quantityStep;
};

export const calculateCatalogLineAmount = ({
  unitPrice,
  requestedQuantity,
  priceBasisQuantity
}: {
  unitPrice: number;
  requestedQuantity: number;
  priceBasisQuantity: number;
}) => {
  if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) throw new Error('invalid_unit_price');
  if (!Number.isSafeInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new Error('invalid_requested_quantity');
  }
  if (!Number.isSafeInteger(priceBasisQuantity) || priceBasisQuantity <= 0) {
    throw new Error('invalid_price_basis_quantity');
  }

  const amount = Math.round((unitPrice * requestedQuantity) / priceBasisQuantity);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('invalid_line_amount');
  return amount;
};
