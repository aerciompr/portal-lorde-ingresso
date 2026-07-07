'use client';

import React, { useState } from 'react';

interface EventImageProps {
  src?: string | null;
  className?: string;
  alt?: string;
}

export default function EventImage({ src, className = '', alt = 'Event thumbnail' }: EventImageProps) {
  const [errored, setErrored] = useState(false);

  if (!src || errored) {
    return (
      <div className={`${className} flex items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-black`}>
        <span className="text-4xl opacity-30">🎫</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setErrored(true)}
    />
  );
}
