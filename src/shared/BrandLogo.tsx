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
  const isWayYaamBrand = !logoUrl && !name?.trim();

  return (
    <div
      className={`brand-logo${compact ? ' brand-logo--compact' : ''}${isWayYaamBrand ? ' brand-logo--wayyaam' : ''}`}
      aria-label={isWayYaamBrand ? 'WayYaam' : `Бренд ${name?.trim() || 'ресторана'}`}
    >
      {isWayYaamBrand ? (
        <img
          src={`${import.meta.env.BASE_URL}assets/logo/wayyaam-wordmark.png`}
          alt="WayYaam"
        />
      ) : (
        <>
          {logoUrl && <img src={logoUrl} alt="" />}
          <div>
            <strong>{name?.trim() || 'Каталог'}</strong>
            {!compact && <span>{subtitle?.trim() || 'каталог'}</span>}
          </div>
        </>
      )}
    </div>
  );
}
