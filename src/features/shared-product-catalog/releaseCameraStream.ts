const isTrackBearingSource = (source: HTMLVideoElement['srcObject']): source is MediaStream => (
  source !== null && typeof (source as MediaStream).getTracks === 'function'
);

export const releaseCameraStream = (
  video: HTMLVideoElement | null,
  stream: MediaStream | null
) => {
  const streams = new Set<MediaStream>();
  if (stream) streams.add(stream);
  if (video && isTrackBearingSource(video.srcObject)) streams.add(video.srcObject);

  video?.pause();
  streams.forEach((activeStream) => {
    activeStream.getTracks().forEach((track) => track.stop());
  });
  if (video) video.srcObject = null;
};
