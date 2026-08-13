import { supabase } from '../supabase';

export type GroceryInventoryItem = {
  productId: string;
  costPrice: number;
  minimumStock: number;
};

export type GroceryInventoryMovement = {
  id: string;
  documentId: string;
  documentType: 'receiving' | 'writeoff' | 'inventory' | 'pos_sale';
  supplierName: string;
  note: string;
  productId: string;
  quantityDelta: number;
  unitCost: number;
  unitPrice: number;
  stockBefore: number;
  stockAfter: number;
  createdAt: string;
};

export type GroceryReceivingLineInput = {
  productId: string;
  quantity: number;
  unitCost: number;
  unitPrice: number;
  minimumStock: number;
};

type InventoryItemRow = {
  product_id: string;
  cost_price: number;
  minimum_stock: number;
};

type InventoryLineRow = {
  id: string;
  document_id: string;
  product_id: string;
  quantity_delta: number;
  unit_cost: number;
  unit_price: number;
  stock_before: number;
  stock_after: number;
  created_at: string;
  catalog_inventory_documents?: {
    document_type?: GroceryInventoryMovement['documentType'];
    supplier_name?: string;
    note?: string;
  } | null;
};

const isMissingInventorySchema = (error: { code?: string | null } | null | undefined) =>
  Boolean(error && ['42P01', 'PGRST200', 'PGRST205'].includes(error.code ?? ''));

export async function loadGroceryInventory(catalogId: string): Promise<{
  items: GroceryInventoryItem[];
  movements: GroceryInventoryMovement[];
}> {
  if (!supabase) return { items: [], movements: [] };

  const [itemsResult, movementsResult] = await Promise.all([
    supabase
      .from('catalog_inventory_items')
      .select('product_id, cost_price, minimum_stock')
      .eq('catalog_id', catalogId),
    supabase
      .from('catalog_inventory_document_lines')
      .select('id, document_id, product_id, quantity_delta, unit_cost, unit_price, stock_before, stock_after, created_at, catalog_inventory_documents!inner(document_type, supplier_name, note)')
      .eq('catalog_id', catalogId)
      .order('created_at', { ascending: false })
      .limit(200)
  ]);

  if (isMissingInventorySchema(itemsResult.error) || isMissingInventorySchema(movementsResult.error)) {
    return { items: [], movements: [] };
  }
  if (itemsResult.error) throw new Error(itemsResult.error.message);
  if (movementsResult.error) throw new Error(movementsResult.error.message);

  return {
    items: ((itemsResult.data ?? []) as InventoryItemRow[]).map((row) => ({
      productId: row.product_id,
      costPrice: Number(row.cost_price) || 0,
      minimumStock: Number(row.minimum_stock) || 0
    })),
    movements: ((movementsResult.data ?? []) as unknown as InventoryLineRow[]).map((row) => ({
      id: row.id,
      documentId: row.document_id,
      documentType: row.catalog_inventory_documents?.document_type ?? 'receiving',
      supplierName: row.catalog_inventory_documents?.supplier_name ?? '',
      note: row.catalog_inventory_documents?.note ?? '',
      productId: row.product_id,
      quantityDelta: Number(row.quantity_delta) || 0,
      unitCost: Number(row.unit_cost) || 0,
      unitPrice: Number(row.unit_price) || 0,
      stockBefore: Number(row.stock_before) || 0,
      stockAfter: Number(row.stock_after) || 0,
      createdAt: row.created_at
    }))
  };
}

export async function saveGroceryInventoryItem({
  catalogId,
  productId,
  costPrice,
  minimumStock
}: {
  catalogId: string;
  productId: string;
  costPrice: number;
  minimumStock: number;
}) {
  if (!supabase) return;
  const { error } = await supabase.from('catalog_inventory_items').upsert({
    catalog_id: catalogId,
    product_id: productId,
    cost_price: Math.max(0, Math.round(costPrice)),
    minimum_stock: Math.max(0, Math.round(minimumStock)),
    updated_at: new Date().toISOString()
  }, { onConflict: 'catalog_id,product_id' });
  if (error) throw new Error(error.message);
}

export async function postGroceryReceiving({
  catalogId,
  supplierName,
  note,
  lines
}: {
  catalogId: string;
  supplierName: string;
  note: string;
  lines: GroceryReceivingLineInput[];
}) {
  if (!supabase) return crypto.randomUUID();
  const { data, error } = await supabase.rpc('post_catalog_receiving', {
    target_catalog_id: catalogId,
    target_supplier_name: supplierName.trim(),
    target_note: note.trim(),
    target_lines: lines.map((line) => ({
      product_id: line.productId,
      quantity: Math.max(0, Math.round(line.quantity)),
      unit_cost: Math.max(0, Math.round(line.unitCost)),
      unit_price: Math.max(0, Math.round(line.unitPrice)),
      minimum_stock: Math.max(0, Math.round(line.minimumStock))
    }))
  });
  if (error) throw new Error(error.message);
  return String(data);
}
