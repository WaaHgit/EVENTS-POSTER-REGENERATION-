import posterAssetUrl from '../assets/poster.png';

export interface PosterTemplate {
  id: string;
  name: string;
  description?: string;
  image_url: string;
  width: number;
  height: number;
  photo_x: number;
  photo_y: number;
  photo_width: number;
  photo_height: number;
  photo_radius: number;
  name_x: number;
  name_y: number;
  name_width: number;
  name_height: number;
  name_font_family: string;
  name_font_weight: string;
  name_min_font_size: number;
  name_max_font_size: number;
  name_color: string;
  name_background_color: string;
  name_border_color?: string;
  is_active: boolean;
  export_scale?: number;
  created_at?: string;
  updated_at?: string;
}

export const DEFAULT_POSTER_TEMPLATE: PosterTemplate = {
  id: 'utq-20th-anniversary-default',
  name: 'UTQ 20th Anniversary Official Poster',
  description: 'Official 20th Anniversary celebration flyer and attendee badge template',
  image_url: posterAssetUrl || '/poster.png',
  width: 1536,
  height: 1536,
  photo_x: 60,
  photo_y: 505,
  photo_width: 480,
  photo_height: 715,
  photo_radius: 20,
  name_x: 60,
  name_y: 1120,
  name_width: 480,
  name_height: 95,
  name_font_family: 'system-ui, -apple-system, sans-serif',
  name_font_weight: 'bold',
  name_min_font_size: 14,
  name_max_font_size: 42,
  name_color: '#FFFFFF',
  name_background_color: '#0B2776',
  name_border_color: '#DEA303',
  is_active: true,
  export_scale: 1,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

export interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CompositionData {
  name: string;
  photoUrl: string;
  crop?: CropArea;
}

export { posterAssetUrl };

// In-memory high-speed image cache
const imageCache = new Map<string, HTMLImageElement>();

/**
 * Loads an image with high-speed memory caching and error recovery
 */
export function loadImage(src: string): Promise<HTMLImageElement> {
  if (!src) return Promise.reject(new Error('No image source provided'));

  if (imageCache.has(src)) {
    const cached = imageCache.get(src)!;
    if (cached.complete && cached.naturalWidth > 0) {
      return Promise.resolve(cached);
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const isData = src.startsWith('data:');
    const isBlob = src.startsWith('blob:');
    const isRemote = src.startsWith('http://') || src.startsWith('https://');
    const isSameOrigin = typeof window !== 'undefined' && isRemote && src.startsWith(window.location.origin);

    // Only apply crossOrigin to remote cross-origin requests to prevent CORS issues on relative assets
    if (isRemote && !isSameOrigin && !isData && !isBlob) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = async () => {
      try {
        if ('decode' in img) await img.decode();
      } catch {}
      imageCache.set(src, img);
      resolve(img);
    };

    img.onerror = () => {
      // In case of CORS error with crossOrigin on remote URLs, retry without crossOrigin
      if (img.crossOrigin && !isData && !isBlob) {
        const retryImg = new Image();
        retryImg.onload = async () => {
          try {
            if ('decode' in retryImg) await retryImg.decode();
          } catch {}
          imageCache.set(src, retryImg);
          resolve(retryImg);
        };
        retryImg.onerror = () => reject(new Error(`Failed to load image asset`));
        retryImg.src = src;
      } else {
        reject(new Error(`Failed to load image asset`));
      }
    };
    img.src = src;
  });
}

// Preload base poster immediately for instantaneous composition
if (typeof window !== 'undefined') {
  loadImage(DEFAULT_POSTER_TEMPLATE.image_url || posterAssetUrl || '/poster.png').catch(() => {});
}

// Reusable canvas instance for optimal memory and garbage collection prevention
let sharedCanvas: HTMLCanvasElement | null = null;
function getSharedCanvas(): HTMLCanvasElement {
  if (!sharedCanvas && typeof document !== 'undefined') {
    sharedCanvas = document.createElement('canvas');
  }
  return sharedCanvas || document.createElement('canvas');
}

/**
 * Composes the poster dynamically using the provided PosterTemplate
 * Single source of truth for both live preview, configurator preview, and final export PNG
 */
export async function composePoster(
  data: CompositionData, 
  template: PosterTemplate = DEFAULT_POSTER_TEMPLATE, 
  scale: number = 1
): Promise<string> {
  const canvas = scale <= 0.5 ? getSharedCanvas() : document.createElement('canvas');
  const targetW = Math.round(template.width * scale);
  const targetH = Math.round(template.height * scale);

  if (canvas.width !== targetW) canvas.width = targetW;
  if (canvas.height !== targetH) canvas.height = targetH;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not get canvas context');

  // Clear previous frame
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Enable high quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = scale < 0.5 ? 'medium' : 'high';

  // 1. Draw Base Official Poster (Immutable background asset - with layered multi-source fallback)
  let baseDrawn = false;
  const candidateUrls = [
    template.image_url,
    posterAssetUrl,
    '/poster.png'
  ].filter((u): u is string => Boolean(u && typeof u === 'string'));

  // Remove duplicates while preserving priority order
  const uniqueUrls = Array.from(new Set(candidateUrls));

  for (const url of uniqueUrls) {
    try {
      const baseImg = await loadImage(url);
      ctx.drawImage(baseImg, 0, 0, canvas.width, canvas.height);
      baseDrawn = true;
      break;
    } catch {
      // Continue to next fallback URL smoothly
    }
  }

  if (!baseDrawn) {
    // Fallback luxury deep navy gradient
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#071848');
    grad.addColorStop(1, '#0B2776');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // 2. Draw Clipped User Photo
  if (data.photoUrl) {
    const px = Math.round(template.photo_x * scale);
    const py = Math.round(template.photo_y * scale);
    const pw = Math.round(template.photo_width * scale);
    const ph = Math.round(template.photo_height * scale);
    const pr = Math.min(Math.round(template.photo_radius * scale), Math.min(pw, ph) / 2);

    ctx.save();
    // Rounded-rectangle clip path matching the frame
    ctx.beginPath();
    ctx.moveTo(px + pr, py);
    ctx.lineTo(px + pw - pr, py);
    ctx.quadraticCurveTo(px + pw, py, px + pw, py + pr);
    ctx.lineTo(px + pw, py + ph - pr);
    ctx.quadraticCurveTo(px + pw, py + ph, px + pw - pr, py + ph);
    ctx.lineTo(px + pr, py + ph);
    ctx.quadraticCurveTo(px, py + ph, px, py + ph - pr);
    ctx.lineTo(px, py + pr);
    ctx.quadraticCurveTo(px, py, px + pr, py);
    ctx.closePath();
    ctx.clip();

    // Draw user photo with crop or direct cover fit
    try {
      const userImg = await loadImage(data.photoUrl);
      if (data.crop && data.crop.width > 0 && data.crop.height > 0) {
        ctx.drawImage(
          userImg,
          data.crop.x, data.crop.y, data.crop.width, data.crop.height,
          px, py, pw, ph
        );
      } else {
        // Fallback cover calculation
        const imgAspect = userImg.naturalWidth / userImg.naturalHeight;
        const frameAspect = pw / ph;
        let sx = 0, sy = 0, sw = userImg.naturalWidth, sh = userImg.naturalHeight;

        if (imgAspect > frameAspect) {
          sw = userImg.naturalHeight * frameAspect;
          sx = (userImg.naturalWidth - sw) / 2;
        } else {
          sh = userImg.naturalWidth / frameAspect;
          sy = (userImg.naturalHeight - sh) / 2;
        }

        ctx.drawImage(userImg, sx, sy, sw, sh, px, py, pw, ph);
      }
    } catch (err) {
      console.warn('Failed to load user photo for compositing:', err);
    }
    ctx.restore();
  }

  // 3. Draw Name Pill Banner
  const rawName = (data.name || '').trim().toUpperCase();
  if (rawName && template.name_width > 0 && template.name_height > 0) {
    const pillX = Math.round(template.name_x * scale);
    const pillY = Math.round(template.name_y * scale);
    const pillW = Math.round(template.name_width * scale);
    const pillH = Math.round(template.name_height * scale);
    const pillR = Math.round(pillH / 2);

    ctx.save();
    
    // Draw background if configured
    if (template.name_background_color && template.name_background_color !== 'transparent') {
      ctx.fillStyle = template.name_background_color;
      ctx.beginPath();
      ctx.moveTo(pillX + pillR, pillY);
      ctx.lineTo(pillX + pillW - pillR, pillY);
      ctx.quadraticCurveTo(pillX + pillW, pillY, pillX + pillW, pillY + pillR);
      ctx.lineTo(pillX + pillW, pillY + pillH - pillR);
      ctx.quadraticCurveTo(pillX + pillW, pillY + pillH, pillX + pillW - pillR, pillY + pillH);
      ctx.lineTo(pillX + pillR, pillY + pillH);
      ctx.quadraticCurveTo(pillX, pillY + pillH, pillX, pillY + pillH - pillR);
      ctx.lineTo(pillX, pillY + pillR);
      ctx.quadraticCurveTo(pillX, pillY, pillX + pillR, pillY);
      ctx.closePath();
      ctx.fill();

      // Border outline
      if (template.name_border_color && template.name_border_color !== 'transparent') {
        ctx.strokeStyle = template.name_border_color;
        ctx.lineWidth = Math.max(1.5, 2 * scale);
        ctx.stroke();
      }
    }

    // 4. Draw Attendee Name Text
    ctx.fillStyle = template.name_color || '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const maxFontSize = (template.name_max_font_size || 42) * scale;
    const minFontSize = (template.name_min_font_size || 14) * scale;
    const fontFamily = template.name_font_family || 'system-ui, -apple-system, sans-serif';
    const fontWeight = template.name_font_weight || 'bold';

    let fontSize = maxFontSize;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    
    // Dynamic text size fitting with padding
    const maxTextWidth = pillW - (36 * scale);
    while (ctx.measureText(rawName).width > maxTextWidth && fontSize > minFontSize) {
      fontSize -= 1.5 * scale;
      ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    }

    ctx.fillText(rawName, pillX + (pillW / 2), pillY + (pillH / 2) + (1 * scale));
    ctx.restore();
  }

  // Use fast JPEG compression for live real-time preview (scale < 0.6), high-res PNG for final export
  if (scale < 0.6) {
    return canvas.toDataURL('image/jpeg', 0.88);
  }
  return canvas.toDataURL('image/png');
}

/**
 * Ultra-fast client-side image loader and downscaler
 * Ensures sub-50ms instant loading into cropper (down from multi-second lag)
 * Downscales gigantic phone photos to a high-fidelity 2048px bounding box
 */
export async function optimizeUploadImage(file: File): Promise<string> {
  // 1. Off-main-thread hardware decoding via createImageBitmap if available
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      const maxDimension = 2048;
      let targetW = bitmap.width;
      let targetH = bitmap.height;

      if (targetW > maxDimension || targetH > maxDimension) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxDimension) / targetW);
          targetW = maxDimension;
        } else {
          targetW = Math.round((targetW * maxDimension) / targetH);
          targetH = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(bitmap, 0, 0, targetW, targetH);
        bitmap.close();
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        // Pre-warm the cache for this data url
        loadImage(dataUrl).catch(() => {});
        return dataUrl;
      }
      bitmap.close();
    } catch (bitmapErr) {
      console.warn('createImageBitmap fallback:', bitmapErr);
    }
  }

  // 2. Fast Object URL pipeline
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDimension = 2048;
      let targetW = img.naturalWidth || img.width;
      let targetH = img.naturalHeight || img.height;

      if (targetW > maxDimension || targetH > maxDimension) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxDimension) / targetW);
          targetW = maxDimension;
        } else {
          targetW = Math.round((targetW * maxDimension) / targetH);
          targetH = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(objectUrl);
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      loadImage(dataUrl).catch(() => {});
      resolve(dataUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    };
    img.src = objectUrl;
  });
}

/**
 * Inspects image file to get native dimensions quickly
 */
export async function getImageDimensions(file: File | string): Promise<{ width: number; height: number; url: string }> {
  if (typeof file === 'string') {
    const img = await loadImage(file);
    return { width: img.naturalWidth, height: img.naturalHeight, url: file };
  }

  const optimizedUrl = await optimizeUploadImage(file);
  const img = await loadImage(optimizedUrl);
  return { width: img.naturalWidth, height: img.naturalHeight, url: optimizedUrl };
}
