import { cn } from '@/lib/utils';
import { ImageOff, Lock } from 'lucide-react';
import Image from 'next/image';

interface ObjectImageProps {
  src: string | null;
  alt: string;
  fill?: boolean;
  width?: number;
  height?: number;
  className?: string;
  priority?: boolean;
  sizes?: string;
  isPublicDomain?: boolean;
}

export default function ObjectImage({
  src,
  alt,
  fill = false,
  width,
  height,
  className,
  priority = false,
  sizes = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw',
  isPublicDomain = true,
}: ObjectImageProps) {
  if (!src || !isPublicDomain) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-(--color-cream-dark)',
          fill ? 'absolute inset-0' : '',
          className,
        )}
        style={!fill ? { width, height } : undefined}
      >
        <div className="flex flex-col items-center gap-2 text-(--color-warm-gray-light)">
          {!isPublicDomain && src ? <Lock size={32} /> : <ImageOff size={32} />}
        </div>
      </div>
    );
  }

  if (fill) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        className={cn('object-cover', className)}
        priority={priority}
        sizes={sizes}
        unoptimized
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width || 400}
      height={height || 400}
      className={className}
      priority={priority}
      sizes={sizes}
      unoptimized
    />
  );
}
