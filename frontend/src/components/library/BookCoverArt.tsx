import React from 'react';

interface BookCoverArtProps {
  bookId: string;
  contentType?: string;
}

export function BookCoverArt({ bookId, contentType }: BookCoverArtProps) {
  let h = 0;
  for (let i = 0; i < bookId.length; i++) {
    h = (h * 31 + bookId.charCodeAt(i)) | 0;
  }
  const seed = Math.abs(h);

  const rot = (seed % 110) - 55; // -55..55 deg
  const scale = Number((0.85 + ((seed >> 4) % 31) / 100).toFixed(2)); // 0.85..1.15
  const variant = seed % 3;
  const offA = seed % 30;
  const offB = (seed >> 5) % 30;
  const offC = (seed >> 7) % 30;

  const ct = (contentType || '').toUpperCase();
  const family =
    ct === 'TEXTBOOK'
      ? 'geometric'
      : ct === 'REFERENCE'
      ? 'weave'
      : ct === 'NOVEL'
      ? 'symbol'
      : 'particles';

  // Seed-derived variations
  const strokeWidthGeo = (0.7 + ((seed >> 11) % 5) / 10).toFixed(1);
  const strokeWidthWeave = (0.7 + ((seed >> 9) % 5) / 10).toFixed(1);
  const strokeWidthSymOuter = (1.8 + ((seed >> 7) % 5) / 10).toFixed(1);
  const strokeWidthSymInner = (1.0 + ((seed >> 9) % 5) / 10).toFixed(1);
  const particleRadius = (0.7 + ((seed >> 9) % 6) / 10).toFixed(1);
  const particleCount = 24 + (seed % 29); // 24..52
  const geoCount = 10 + (seed % 7); // 10..16
  const weaveCount = 8 + (seed % 9); // 8..16

  let pattern = null;

  if (family === 'geometric') {
    if (variant === 1) {
      // Variant 1: Diagonal cascade
      pattern = (
        <>
          {[...Array(geoCount)].map((_, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const cx = 16 + col * 28 + row * 12 + (offA % 8);
            const cy = 20 + row * 34 + (offB % 12);
            return (
              <circle
                key={`c-diag-${i}`}
                cx={cx}
                cy={cy}
                r="5.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidthGeo}
              />
            );
          })}
          {[...Array(geoCount)].map((_, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const x = 12 + col * 28 + row * 12 + ((20 - offA) % 8);
            const y = 16 + row * 34 + ((20 - offB) % 12);
            return (
              <rect
                key={`r-diag-${i}`}
                x={x}
                y={y}
                width="7.5"
                height="7.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidthGeo}
              />
            );
          })}
          <circle
            cx={50 + (offA % 20) - 10}
            cy={70 + (offB % 30) - 15}
            r="2.5"
            fill="currentColor"
            opacity="0.6"
          />
        </>
      );
    } else if (variant === 2) {
      // Variant 2: Concentric rings and centered squares
      pattern = (
        <>
          {[...Array(Math.min(geoCount, 7))].map((_, i) => {
            const r = 12 + i * 9;
            const size = 10 + i * 9;
            return (
              <React.Fragment key={`concentric-${i}`}>
                <circle
                  cx={50}
                  cy={70}
                  r={r}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={strokeWidthGeo}
                />
                <rect
                  x={50 - size}
                  y={70 - size}
                  width={size * 2}
                  height={size * 2}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={strokeWidthGeo}
                  transform={`rotate(${i * 15} 50 70)`}
                />
              </React.Fragment>
            );
          })}
          <circle cx={50} cy={70} r="3" fill="currentColor" opacity="0.6" />
        </>
      );
    } else {
      // Variant 0: Standard grid
      pattern = (
        <>
          {[...Array(geoCount)].map((_, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const cx = 20 + col * 30 + (offA % 15);
            const cy = 25 + row * 40 + (offB % 20);
            return (
              <circle
                key={`c-${i}`}
                cx={cx}
                cy={cy}
                r="6"
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidthGeo}
              />
            );
          })}
          {[...Array(geoCount)].map((_, i) => {
            const col = i % 3;
            const row = Math.floor(i / 3);
            const x = 16 + col * 30 + ((30 - offA) % 15);
            const y = 21 + row * 40 + ((30 - offB) % 20);
            return (
              <rect
                key={`r-${i}`}
                x={x}
                y={y}
                width="8"
                height="8"
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidthGeo}
              />
            );
          })}
          <circle
            cx={50 + (offA % 20) - 10}
            cy={70 + (offB % 30) - 15}
            r="2.5"
            fill="currentColor"
            opacity="0.6"
          />
        </>
      );
    }
  } else if (family === 'weave') {
    if (variant === 1) {
      // Variant 1: Vertical-dominant traces
      pattern = (
        <>
          {[...Array(weaveCount)].map((_, i) => {
            const x = 12 + i * (76 / Math.max(1, weaveCount - 1));
            const stepY = 20 + ((offB + i * 19) % 80);
            return (
              <polyline
                key={`v-dom-${i}`}
                points={`${x},0 ${x},${stepY} ${x + 6},${stepY + 6} ${x + 6},140`}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidthWeave}
              />
            );
          })}
          {[...Array(4)].map((_, i) => {
            const y = 25 + i * 30;
            return (
              <polyline
                key={`h-cross-${i}`}
                points={`0,${y} 40,${y} 48,${y + 8} 100,${y + 8}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidthWeave}
              />
            );
          })}
          {[0, 1, 2, 3].map((i) => {
            const cx = 20 + ((offA * (i + 1) * 7) % 60);
            const cy = 30 + ((offB * (i + 1) * 11) % 80);
            return (
              <circle
                key={`node-v-${i}`}
                cx={cx}
                cy={cy}
                r={(0.8 + (i % 2) * 0.4).toFixed(1)}
                fill="currentColor"
              />
            );
          })}
        </>
      );
    } else if (variant === 2) {
      // Variant 2: Mixed grid with dense nodes
      const half = Math.ceil(weaveCount / 2);
      pattern = (
        <>
          {[...Array(half)].map((_, i) => {
            const y = 15 + i * (110 / Math.max(1, half - 1));
            const stepX = 20 + ((offA + i * 13) % 60);
            return (
              <polyline
                key={`h-mix-${i}`}
                points={`0,${y} ${stepX},${y} ${stepX + 8},${y + 8} 100,${y + 8}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidthWeave}
              />
            );
          })}
          {[...Array(half)].map((_, i) => {
            const x = 15 + i * (70 / Math.max(1, half - 1));
            const stepY = 20 + ((offB + i * 17) % 80);
            return (
              <polyline
                key={`v-mix-${i}`}
                points={`${x},0 ${x},${stepY} ${x + 6},${stepY + 6} ${x + 6},140`}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidthWeave}
              />
            );
          })}
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const cx = 15 + ((offA * (i + 1) * 11) % 70);
            const cy = 20 + ((offB * (i + 1) * 13) % 100);
            return (
              <circle
                key={`node-mix-${i}`}
                cx={cx}
                cy={cy}
                r="1.2"
                fill="currentColor"
              />
            );
          })}
        </>
      );
    } else {
      // Variant 0: Horizontal-dominant traces
      pattern = (
        <>
          {[...Array(weaveCount)].map((_, i) => {
            const y = 15 + i * (110 / Math.max(1, weaveCount - 1));
            const stepX = 25 + ((offA + i * 11) % 50);
            return (
              <polyline
                key={`h-${i}`}
                points={`0,${y} ${stepX},${y} ${stepX + 8},${y + 8} 100,${y + 8}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidthWeave}
              />
            );
          })}
          {[...Array(4)].map((_, i) => {
            const x = 20 + i * 20;
            const stepY = 25 + ((offB + i * 17) % 80);
            return (
              <polyline
                key={`v-${i}`}
                points={`${x},0 ${x},${stepY} ${x + 6},${stepY + 6} ${x + 6},140`}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidthWeave}
              />
            );
          })}
          {[0, 1, 2, 3].map((i) => {
            const cx = 25 + ((offA * (i + 1) * 7) % 50);
            const cy = 35 + ((offB * (i + 1) * 11) % 70);
            return (
              <circle
                key={`node-${i}`}
                cx={cx}
                cy={cy}
                r={(0.8 + (i % 2) * 0.4).toFixed(1)}
                fill="currentColor"
              />
            );
          })}
        </>
      );
    }
  } else if (family === 'symbol') {
    const cx = 50;
    const cy = 70;
    let mainShape = null;
    let innerShape = null;

    if (variant === 0) {
      // Variant 0: Triangle
      mainShape = (
        <polygon
          points={`${cx},28 ${cx + 36},${cy + 38} ${cx - 36},${cy + 38}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidthSymOuter}
          transform={`rotate(${rot} ${cx} ${cy})`}
        />
      );
      innerShape = (
        <polygon
          points={`${cx},48 ${cx + 20},${cy + 25} ${cx - 20},${cy + 25}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidthSymInner}
          transform={`rotate(${-rot * 1.2} ${cx} ${cy})`}
        />
      );
    } else if (variant === 1) {
      // Variant 1: Hexagon
      mainShape = (
        <polygon
          points={`${cx},35 ${cx + 30},52 ${cx + 30},88 ${cx},105 ${cx - 30},88 ${cx - 30},52`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidthSymOuter}
          transform={`rotate(${rot} ${cx} ${cy})`}
        />
      );
      innerShape = (
        <polygon
          points={`${cx},50 ${cx + 18},60 ${cx + 18},80 ${cx},90 ${cx - 18},80 ${cx - 18},60`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidthSymInner}
          transform={`rotate(${-rot * 1.2} ${cx} ${cy})`}
        />
      );
    } else {
      // Variant 2: Eight-pointed star / diamond
      mainShape = (
        <polygon
          points={`${cx},22 ${cx + 36},${cy} ${cx},118 ${cx - 36},${cy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidthSymOuter}
          transform={`rotate(${rot} ${cx} ${cy})`}
        />
      );
      innerShape = (
        <polygon
          points={`${cx},44 ${cx + 20},${cy} ${cx},96 ${cx - 20},${cy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidthSymInner}
          transform={`rotate(${-rot * 1.2 + 45} ${cx} ${cy})`}
        />
      );
    }

    pattern = (
      <>
        {mainShape}
        {innerShape}
        {/* Subtle center core dot */}
        <circle cx={cx} cy={cy} r="2" fill="currentColor" opacity="0.6" />
      </>
    );
  } else {
    // Family: particles
    if (variant === 1) {
      // Variant 1: Clustered around 2 focal points
      const f1 = { x: 35, y: 50 };
      const f2 = { x: 65, y: 90 };
      pattern = (
        <>
          {[...Array(particleCount)].map((_, i) => {
            const focal = i % 2 === 0 ? f1 : f2;
            const spreadX = ((seed * (i + 1) * 17 + offA * 3) % 41) - 20;
            const spreadY = ((seed * (i + 1) * 23 + offB * 5) % 45) - 22;
            const cx = Math.max(8, Math.min(92, focal.x + spreadX));
            const cy = Math.max(8, Math.min(132, focal.y + spreadY));
            const op = 0.5 + (((seed + i * 13) % 50) / 100);
            return (
              <circle
                key={`dot-cluster-${i}`}
                cx={cx}
                cy={cy}
                r={particleRadius}
                fill="currentColor"
                opacity={op}
              />
            );
          })}
        </>
      );
    } else if (variant === 2) {
      // Variant 2: Swept along an arc
      pattern = (
        <>
          {[...Array(particleCount)].map((_, i) => {
            const t = i / Math.max(1, particleCount - 1);
            const wave = Math.sin(t * Math.PI * 2) * 18;
            const jx = ((seed * (i + 1) * 7) % 15) - 7;
            const jy = ((seed * (i + 1) * 13) % 15) - 7;
            const cx = Math.max(8, Math.min(92, 15 + t * 70 + wave + jx));
            const cy = Math.max(8, Math.min(132, 15 + t * 110 + jy));
            const op = 0.5 + (((seed + i * 13) % 50) / 100);
            return (
              <circle
                key={`dot-arc-${i}`}
                cx={cx}
                cy={cy}
                r={particleRadius}
                fill="currentColor"
                opacity={op}
              />
            );
          })}
        </>
      );
    } else {
      // Variant 0: Uniform scatter
      pattern = (
        <>
          {[...Array(particleCount)].map((_, i) => {
            const cx = ((seed * (i + 1) * 19 + offA * 3) % 86) + 7;
            const cy = ((seed * (i + 1) * 29 + offB * 5 + offC) % 126) + 7;
            const op = 0.5 + (((seed + i * 13) % 50) / 100);
            return (
              <circle
                key={`dot-${i}`}
                cx={cx}
                cy={cy}
                r={particleRadius}
                fill="currentColor"
                opacity={op}
              />
            );
          })}
        </>
      );
    }
  }

  return (
    <svg
      className={`book-cover-art book-cover-art-${family}`}
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ ['--book-cover-rot' as any]: `${rot}deg` }}
    >
      <g transform={`translate(${50 * (1 - scale)} ${70 * (1 - scale)}) scale(${scale})`}>
        {pattern}
      </g>
    </svg>
  );
}

