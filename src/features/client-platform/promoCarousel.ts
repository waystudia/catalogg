export const getPromoAutoAdvanceDelay = ({
  bannerCount,
  isVideo,
  videoPlayedToEnd
}: {
  bannerCount: number;
  isVideo: boolean;
  videoPlayedToEnd: boolean;
}) => {
  if (bannerCount < 2) return null;
  if (isVideo && !videoPlayedToEnd) return null;
  return isVideo ? 1200 : 5000;
};

export const getPromoLoopResetIndex = (displayedIndex: number, bannerCount: number) => {
  if (bannerCount < 2) return null;
  if (displayedIndex === 0) return bannerCount;
  if (displayedIndex === bannerCount + 1) return 1;
  return null;
};
