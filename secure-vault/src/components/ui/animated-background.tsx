"use client";

import React from "react";

export function AnimatedBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden bg-background">
      {/* Animated Gradient Orbs */}
      <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/20 blur-[120px] mix-blend-multiply animate-pulse dark:mix-blend-screen" style={{ animationDuration: '8s' }} />
      <div className="absolute top-[20%] -right-[10%] w-[60%] h-[60%] rounded-full bg-primary/30 blur-[130px] mix-blend-multiply animate-pulse dark:mix-blend-screen" style={{ animationDuration: '10s', animationDelay: '2s' }} />
      <div className="absolute -bottom-[20%] left-[20%] w-[70%] h-[70%] rounded-full bg-primary/10 blur-[140px] mix-blend-multiply animate-pulse dark:mix-blend-screen" style={{ animationDuration: '12s', animationDelay: '4s' }} />
      
      {/* Optional Subtle Grid Overlay (To give it structure) */}
      <div className="absolute inset-0 bg-[url('https://res.cloudinary.com/djpkrqhw5/image/upload/v1714574971/grid-pattern_ebz2hx.svg')] bg-center [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))] opacity-20 dark:opacity-10 dark:invert"></div>
    </div>
  );
}
