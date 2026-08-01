type PublicCategoryLike = {
  slug?: string | null;
  kind?: string | null;
};

export const isPublicMenuCategory = (category: PublicCategoryLike) =>
  category.kind !== 'space' && category.slug?.trim().toLocaleLowerCase('en-US') !== 'cabins';
