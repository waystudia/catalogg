import type { PlatformBannerPosition } from '../../shared/api/platformTypes';

export type BannerTemplateExportInput = {
  sourceUrl: string;
  title: string;
  subtitle: string;
  actionLabel: string;
  contentPosition: PlatformBannerPosition;
  buttonPosition: PlatformBannerPosition;
  fileName: string;
};

const loadImage = (sourceUrl: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('Не удалось загрузить фон шаблона'));
  image.src = sourceUrl;
});

const drawCoverImage = (
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number
) => {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = (image.naturalWidth - sourceWidth) / 2;
  const sourceY = (image.naturalHeight - sourceHeight) / 2;
  context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, width, height);
};

const positionAnchor = (position: PlatformBannerPosition) => {
  const horizontal = position.endsWith('right') ? 'right' : position.endsWith('center') || position === 'center' ? 'center' : 'left';
  const x = horizontal === 'right' ? 1504 : horizontal === 'center' ? 800 : 96;
  const y = position.startsWith('bottom') ? 470 : position.startsWith('center') || position === 'center' ? 236 : 86;
  return { horizontal, x, y } as const;
};

const wrapText = (
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) => {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !current) {
      current = candidate;
      return;
    }
    lines.push(current);
    current = word;
  });
  if (current) lines.push(current);

  const visibleLines = lines.slice(0, maxLines);
  if (lines.length > maxLines && visibleLines.length > 0) {
    visibleLines[visibleLines.length - 1] = `${visibleLines[visibleLines.length - 1].replace(/[.…]+$/, '')}…`;
  }
  visibleLines.forEach((line, index) => context.fillText(line, x, y + lineHeight * index));
  return y + lineHeight * visibleLines.length;
};

const roundedRect = (
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) => {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fill();
  context.stroke();
};

export const downloadBannerTemplatePng = async (input: BannerTemplateExportInput) => {
  const image = await loadImage(input.sourceUrl);
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 600;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Браузер не поддерживает создание PNG');

  drawCoverImage(context, image, canvas.width, canvas.height);
  const shade = context.createLinearGradient(0, 0, canvas.width, 0);
  shade.addColorStop(0, 'rgba(10, 8, 35, 0.42)');
  shade.addColorStop(0.5, 'rgba(10, 8, 35, 0.12)');
  shade.addColorStop(1, 'rgba(10, 8, 35, 0.32)');
  context.fillStyle = shade;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const copy = positionAnchor(input.contentPosition);
  context.textAlign = copy.horizontal;
  context.textBaseline = 'top';
  context.fillStyle = '#ffffff';
  context.shadowColor = 'rgba(0, 0, 0, 0.42)';
  context.shadowBlur = 20;
  context.font = '800 72px Inter, Arial, sans-serif';
  const nextY = wrapText(context, input.title || 'Заголовок акции', copy.x, copy.y, 720, 78, 2);
  context.font = '600 30px Inter, Arial, sans-serif';
  context.fillStyle = 'rgba(255, 255, 255, 0.9)';
  wrapText(context, input.subtitle || 'Короткий текст предложения', copy.x, nextY + 14, 720, 38, 2);

  const action = positionAnchor(input.buttonPosition);
  const label = input.actionLabel || 'Подробнее';
  context.font = '800 28px Inter, Arial, sans-serif';
  const buttonWidth = Math.max(220, context.measureText(label).width + 72);
  const buttonHeight = 68;
  const buttonX = action.horizontal === 'right'
    ? action.x - buttonWidth
    : action.horizontal === 'center'
      ? action.x - buttonWidth / 2
      : action.x;
  const buttonY = input.buttonPosition.startsWith('top')
    ? 72
    : input.buttonPosition.startsWith('center') || input.buttonPosition === 'center'
      ? 266
      : 448;
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(91, 63, 244, 0.82)';
  context.strokeStyle = 'rgba(255, 255, 255, 0.56)';
  context.lineWidth = 2;
  roundedRect(context, buttonX, buttonY, buttonWidth, buttonHeight, 22);
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(label, buttonX + buttonWidth / 2, buttonY + buttonHeight / 2 + 1);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Не удалось создать PNG')), 'image/png');
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = input.fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
