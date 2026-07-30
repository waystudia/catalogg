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
