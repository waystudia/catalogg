export const normalizePromoDisplayDurationMs = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 5000;
  return Math.min(60000, Math.max(2000, Math.round(value)));
};

export const getPromoAutoAdvanceDelay = ({
  bannerCount,
  isVideo,
  videoPlayedToEnd,
  displayDurationMs
}: {
  bannerCount: number;
  isVideo: boolean;
  videoPlayedToEnd: boolean;
  displayDurationMs: number | null | undefined;
}) => {
  if (bannerCount < 2) return null;
  if (isVideo && !videoPlayedToEnd) return null;
  return normalizePromoDisplayDurationMs(displayDurationMs);
};

export const getPromoLoopResetIndex = (displayedIndex: number, bannerCount: number) => {
  if (bannerCount < 2) return null;
  if (displayedIndex === 0) return bannerCount;
  if (displayedIndex === bannerCount + 1) return 1;
  return null;
};
