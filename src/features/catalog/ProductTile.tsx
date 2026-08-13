import { Edit3, Eye, EyeOff, Minus, Plus, Star, Trash2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { Product } from '../../entities/models';
import { getProductChoiceOptions } from '../../entities/productVariants';
import { formatCatalogProductPrice, formatRublePrice, isWeightPricedProduct } from '../../entities/productPricing';
import { SafeImage } from '../../shared/SafeImage';
import { useAuthStore, useCartStore } from '../stores';
import {
  getCurrentStock,
  isLimitedProduct,
  playAddSound,
  playCartSound
} from '../restaurant-settings/catalogAdminModel';

export function ProductImageCarousel({ product, hero = false }: { product: Product; hero?: boolean }) {
  const images = product.image_urls?.filter(Boolean).length
    ? product.image_urls.filter(Boolean)
    : product.image_url
      ? [product.image_url]
      : [];
  const [activeIndex, setActiveIndex] = useState(0);
  const [displayedIndex, setDisplayedIndex] = useState(images.length > 1 ? 1 : 0);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [viewerScale, setViewerScale] = useState(1);
  const touchStartX = useRef<number | null>(null);
  const didSwipe = useRef(false);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const scrollEndRef = useRef<number | null>(null);
  const displayedImages = images.length > 1
    ? [images[images.length - 1], ...images, images[0]]
    : (images.length ? images : ['']);

  useEffect(() => {
    setActiveIndex(0);
    setDisplayedIndex(images.length > 1 ? 1 : 0);
    window.requestAnimationFrame(() => {
      const track = trackRef.current;
      if (track) track.scrollTo({ left: images.length > 1 ? track.clientWidth : 0 });
    });
  }, [product.id, images.length]);

  useEffect(() => () => {
    if (scrollEndRef.current !== null) window.clearTimeout(scrollEndRef.current);
  }, []);

  useEffect(() => {
    if (!isViewerOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsViewerOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [isViewerOpen]);

  return (
    <>
      <div
        className={`${hero ? 'product-photo-carousel product-photo-carousel--hero' : 'product-photo-carousel'}${images.length > 1 ? ' product-photo-carousel--swipeable' : ''}`}
        data-active-image={images[activeIndex] ?? product.image_url}
        role={hero ? 'button' : undefined}
        tabIndex={hero ? 0 : undefined}
        aria-label={hero ? `Увеличить фото: ${product.title}` : undefined}
        onKeyDown={(event) => {
          if (hero && (event.key === 'Enter' || event.key === ' ')) setIsViewerOpen(true);
        }}
        onClick={(event) => {
          if (didSwipe.current) {
            event.stopPropagation();
            didSwipe.current = false;
            return;
          }
          if (hero) {
            setViewerScale(1);
            setIsViewerOpen(true);
          }
        }}
        onTouchStart={(event) => {
          if (images.length < 2) return;
          touchStartX.current = event.touches[0]?.clientX ?? null;
          didSwipe.current = false;
        }}
        onTouchEnd={(event) => {
          if (images.length < 2 || touchStartX.current === null) return;
          const delta = (event.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
          touchStartX.current = null;
          didSwipe.current = Math.abs(delta) >= 12;
        }}
      >
        <div
          className="product-photo-carousel__track"
          ref={trackRef}
          onScroll={(event) => {
            const track = event.currentTarget;
            const width = track.clientWidth;
            if (width <= 0) return;
            const rawIndex = Math.round(track.scrollLeft / width);
            setDisplayedIndex(rawIndex);
            setActiveIndex(images.length > 1 ? (rawIndex - 1 + images.length) % images.length : 0);
            if (scrollEndRef.current !== null) window.clearTimeout(scrollEndRef.current);
            scrollEndRef.current = window.setTimeout(() => {
              if (images.length < 2) return;
              const settledIndex = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
              const resetIndex = settledIndex === 0 ? images.length : settledIndex === images.length + 1 ? 1 : null;
              if (resetIndex === null) return;
              track.style.scrollBehavior = 'auto';
              track.scrollTo({ left: resetIndex * track.clientWidth });
              setDisplayedIndex(resetIndex);
              window.requestAnimationFrame(() => {
                track.style.scrollBehavior = '';
              });
            }, 180);
          }}
        >
          {displayedImages.map((image, index) => (
            <span className={`product-photo-carousel__slide${index === displayedIndex ? ' is-active' : ''}`} key={`${image}-${index}`}>
              <SafeImage
                className={hero ? 'product-hero' : undefined}
                src={image}
                alt={activeIndex === 0 ? product.title : `${product.title}, фото ${activeIndex + 1}`}
                loading={hero ? undefined : 'lazy'}
                width={hero ? 1200 : 480}
                height={hero ? 900 : 360}
                fallbackKind={product.placeholder_kind}
                draggable={false}
              />
            </span>
          ))}
        </div>
        {images.length > 1 && (
          <span className="product-photo-carousel__dots" aria-label={`Фото ${activeIndex + 1} из ${images.length}`}>
            {images.map((image, index) => <i className={index === activeIndex ? 'is-active' : ''} key={`${image}-dot-${index}`} />)}
          </span>
        )}
      </div>
      {hero && isViewerOpen && (
        <div className="product-photo-viewer" role="dialog" aria-modal="true" aria-label={`Фото блюда ${product.title}`}>
          <button className="product-photo-viewer__close" type="button" onClick={() => setIsViewerOpen(false)} aria-label="Закрыть">
            <X />
          </button>
          <div className="product-photo-viewer__viewport">
            <SafeImage
              src={images[activeIndex] ?? product.image_url}
              alt={product.title}
              style={{ filter: 'var(--dish-photo-filter, none)', transform: `scale(${viewerScale})` }}
              draggable={false}
              width={1200}
              height={900}
              fallbackKind={product.placeholder_kind}
            />
          </div>
          <div className="product-photo-viewer__controls">
            <button type="button" onClick={() => setViewerScale((value) => Math.max(1, value - 0.5))} aria-label="Уменьшить">
              <ZoomOut />
            </button>
            <button type="button" onClick={() => setViewerScale(1)}>100%</button>
            <button type="button" onClick={() => setViewerScale((value) => Math.min(4, value + 0.5))} aria-label="Увеличить">
              <ZoomIn />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function ProductTile({
  product,
  variant = 'compact',
  onOpen,
  onEdit,
  onDelete,
  onToggle,
  onStockChange,
  onAdd
}: {
  product: Product;
  variant?: 'compact' | 'large' | 'drink';
  onOpen: (product: Product) => void;
  onEdit?: (product: Product) => void;
  onDelete?: (productId: string) => void;
  onToggle?: (productId: string, key: 'is_popular' | 'is_hidden') => void;
  onStockChange?: (productId: string, stockCount: number) => void;
  onAdd?: (product: Product) => void;
}) {
  const add = useCartStore((state) => state.add);
  const decrement = useCartStore((state) => state.decrement);
  const items = useCartStore((state) => state.items);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const currentStock = getCurrentStock(product);
  const soldOut = isLimitedProduct(product) && currentStock <= 0;
  const quantity = items
    .filter((item) => item.product.id === product.id)
    .reduce((total, item) => total + item.quantity, 0);
  const choiceOptions = getProductChoiceOptions(product);
  const requiresConfiguration = choiceOptions.length > 0
    || isWeightPricedProduct(product)
    || (product.modifier_groups ?? []).some((group) => group.isActive !== false)
    || product.allow_inscription
    || product.allow_decoration_comment
    || product.allow_production_schedule;

  const captureCartAnimation = (button: HTMLButtonElement) => {
    const buttonRect = button.getBoundingClientRect();
    const tile = button.closest('.product-tile') as HTMLElement | null;
    const carousel = tile?.querySelector('.product-photo-carousel') as HTMLElement | null;
    const image = tile?.querySelector('.product-photo-carousel__slide.is-active img, .product-tile__image img') as HTMLImageElement | null;
    const visibleImageRect = carousel?.getBoundingClientRect() ?? image?.getBoundingClientRect();
    return {
      buttonRect,
      imageRect: visibleImageRect,
      imageUrl: carousel?.dataset.activeImage || image?.currentSrc || product.image_url
    };
  };

  const playCartAnimation = (
    { buttonRect, imageRect, imageUrl }: ReturnType<typeof captureCartAnimation>,
    reverse = false
  ) => {
    const target = document.querySelector('[data-cart-animation-target] .cart-bar__icon') as HTMLElement | null;
    const targetRect = target?.getBoundingClientRect();
    const startX = imageRect ? imageRect.left + imageRect.width / 2 : buttonRect.left + buttonRect.width / 2;
    const startY = imageRect ? imageRect.top + imageRect.height / 2 : buttonRect.top + buttonRect.height / 2;
    const endX = targetRect ? targetRect.left + targetRect.width / 2 : Math.max(50, window.innerWidth * 0.18);
    const endY = targetRect ? targetRect.top + targetRect.height / 2 : window.innerHeight - 54;
    const flyer = document.createElement('span');
    const width = Math.min(imageRect?.width ?? 64, 180);
    const height = Math.min(imageRect?.height ?? 64, 150);

    flyer.className = reverse ? 'cart-flyer cart-flyer--reverse' : 'cart-flyer';
    flyer.setAttribute('aria-hidden', 'true');
    flyer.style.setProperty('--flyer-start-x', `${startX}px`);
    flyer.style.setProperty('--flyer-start-y', `${startY}px`);
    flyer.style.setProperty('--flyer-mid-x', `${Math.max(58, Math.min(window.innerWidth - 58, window.innerWidth * 0.5))}px`);
    flyer.style.setProperty('--flyer-mid-y', `${Math.max(86, Math.min(startY - 72, window.innerHeight * 0.32))}px`);
    flyer.style.setProperty('--flyer-end-x', `${endX}px`);
    flyer.style.setProperty('--flyer-end-y', `${endY}px`);
    flyer.style.setProperty('--flyer-width', `${width}px`);
    flyer.style.setProperty('--flyer-height', `${height}px`);

    if (imageUrl) {
      const flyerImage = document.createElement('img');
      flyerImage.src = imageUrl;
      flyerImage.alt = '';
      flyer.append(flyerImage);
    } else {
      flyer.classList.add('cart-flyer--empty');
      flyer.textContent = '+';
    }

    document.body.append(flyer);
    const cleanup = () => flyer.remove();
    flyer.addEventListener('animationend', cleanup, { once: true });
    window.setTimeout(cleanup, 1200);
  };

  return (
    <article
      className={`product-tile product-tile--${variant}${product.is_hidden ? ' is-hidden' : ''}${soldOut ? ' is-sold-out' : ''}`}
      onClick={() => onOpen(product)}
    >
      <div className="product-tile__image">
        <ProductImageCarousel product={product} />
        {product.is_popular && <span className="product-state product-state--popular"><Star /></span>}
        {(product.badges ?? []).slice(0, 2).length > 0 && (
          <span className="product-tile__badges">
            {(product.badges ?? []).slice(0, 2).map((badge) => <b key={badge}>{badge}</b>)}
          </span>
        )}
        {quantity > 0 && <b className="product-tile__quantity-badge">{quantity}</b>}
        {product.is_hidden && <span className="product-state product-state--hidden">Скрыто</span>}
        {soldOut && <span className="product-state product-state--sold-out">Закончилось</span>}
        {isAdmin && (
          <div className="admin-card-tools" onClick={(event) => event.stopPropagation()}>
            <button type="button" aria-label="Редактировать" onClick={() => onEdit?.(product)}><Edit3 /></button>
            <button
              type="button"
              aria-label="Минус один остаток"
              disabled={!isLimitedProduct(product) || currentStock <= 0}
              onClick={() => onStockChange?.(product.id, Math.max(0, currentStock - 1))}
            >
              -1
            </button>
            <button className={product.is_popular ? 'is-on' : ''} type="button" aria-label="Популярное" onClick={() => onToggle?.(product.id, 'is_popular')}>
              <Star />
            </button>
            <button
              className={product.is_hidden ? 'is-on' : ''}
              type="button"
              aria-label={product.is_hidden ? 'Показать' : 'Скрыть'}
              onClick={() => onToggle?.(product.id, 'is_hidden')}
            >
              {product.is_hidden ? <EyeOff /> : <Eye />}
            </button>
            <button type="button" aria-label="Удалить" onClick={() => onDelete?.(product.id)}><Trash2 /></button>
            <span className="admin-stock-count">Остаток: {isLimitedProduct(product) ? currentStock : 'без лимита'}</span>
          </div>
        )}
      </div>
      <div className="product-tile__body">
        <div>
          <h3>{product.title}</h3>
          <p>{soldOut ? 'Закончилось' : product.description}</p>
        </div>
        <div className="product-tile__bottom">
          <strong>
            {formatCatalogProductPrice(product)}
            {product.old_price && <del>{formatRublePrice(product.old_price)}</del>}
          </strong>
          <div
            className={quantity > 0 ? 'product-tile__stepper has-quantity' : 'product-tile__stepper'}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.preventDefault()}
          >
            {quantity > 0 && !requiresConfiguration && (
              <>
                <button
                  className="product-tile__stepper-button product-tile__stepper-button--minus"
                  type="button"
                  aria-label={`Уменьшить ${product.title}`}
                  onClick={(event) => {
                    const animationSnapshot = captureCartAnimation(event.currentTarget);
                    playCartAnimation(animationSnapshot, true);
                    decrement(product.id);
                    playCartSound('remove');
                  }}
                >
                  <Minus />
                </button>
                <span className="product-tile__stepper-count">{quantity}</span>
              </>
            )}
            <button
              className="add-button product-tile__stepper-button"
              type="button"
              disabled={soldOut}
              aria-label={`Добавить ${product.title}`}
              onClick={(event) => {
                const button = event.currentTarget;
                if (requiresConfiguration) {
                  onOpen(product);
                  return;
                }
                const animationSnapshot = captureCartAnimation(button);
                add(product);
                onAdd?.(product);
                playAddSound();
                window.requestAnimationFrame(() => playCartAnimation(animationSnapshot));
              }}
            >
              <Plus />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
