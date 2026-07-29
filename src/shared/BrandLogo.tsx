export function BrandLogo({
  compact = false,
  logoUrl,
  name,
  subtitle
}: {
  compact?: boolean;
  logoUrl?: string;
  name?: string;
  subtitle?: string;
}) {
  return (
    <div className={compact ? 'brand-logo brand-logo--compact' : 'brand-logo'}>
      {logoUrl && <img src={logoUrl} alt="" />}
      <div>
        <strong>{name?.trim() || 'Каталог'}</strong>
        {!compact && <span>{subtitle?.trim() || 'каталог'}</span>}
      </div>
    </div>
  );
}
