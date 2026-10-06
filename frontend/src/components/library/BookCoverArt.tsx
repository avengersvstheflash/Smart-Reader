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

  const rot = (seed % 80) - 40; // -40..40 deg
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

  let pattern = null;

  if (family === 'geometric') {
    // 14 circles (r=6) at grid positions offset by seed
    // 14 squares (size 8) offset inversely
    pattern = (
      <>
        {[...Array(14)].map((_, i) => {
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
              strokeWidth="0.8"
            />
          );
        })}
        {[...Array(14)].map((_, i) => {
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
              strokeWidth="0.8"
            />
          );
        })}
      </>
    );
  } else if (family === 'weave') {
    // 10 horizontal polyline paths that step, 10 vertical polylines, 4 intersection circles
    pattern = (
      <>
        {[...Array(10)].map((_, i) => {
          const y = 15 + i * 22;
          const stepX = 25 + ((offA + i * 11) % 50);
          return (
            <polyline
              key={`h-${i}`}
              points={`0,${y} ${stepX},${y} ${stepX + 8},${y + 8} 100,${y + 8}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.9"
            />
          );
        })}
        {[...Array(10)].map((_, i) => {
          const x = 15 + i * 15;
          const stepY = 25 + ((offB + i * 17) % 80);
          return (
            <polyline
              key={`v-${i}`}
              points={`${x},0 ${x},${stepY} ${x + 6},${stepY + 6} ${x + 6},140`}
              fill="none"
              stroke="currentColor"
              strokeWidth="0.9"
            />
          );
        })}
        {[0, 1, 2, 3].map((i) => {
          const cx = 25 + ((offA * (i + 1) * 7) % 50);
          const cy = 35 + ((offB * (i + 1) * 11) % 70);
          return <circle key={`node-${i}`} cx={cx} cy={cy} r="0.8" fill="currentColor" />;
        })}
      </>
    );
  } else if (family === 'symbol') {
    // Large centered geometric shape rotated + concentric shape rotated inversely
    const cx = 50;
    const cy = 70;
    const symbolChoice = seed % 3;
    let mainShape = null;
    let innerShape = null;

    if (symbolChoice === 0) {
      // Diamond
      mainShape = (
        <polygon
          points={`${cx},25 ${cx + 35},${cy} ${cx},115 ${cx - 35},${cy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.0"
          transform={`rotate(${rot} ${cx} ${cy})`}
        />
      );
      innerShape = (
        <polygon
          points={`${cx},45 ${cx + 20},${cy} ${cx},95 ${cx - 20},${cy}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          transform={`rotate(${-rot * 1.2} ${cx} ${cy})`}
        />
      );
    } else if (symbolChoice === 1) {
      // Hexagon
      mainShape = (
        <polygon
          points={`${cx},35 ${cx + 30},52 ${cx + 30},88 ${cx},105 ${cx - 30},88 ${cx - 30},52`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.0"
          transform={`rotate(${rot} ${cx} ${cy})`}
        />
      );
      innerShape = (
        <polygon
          points={`${cx},50 ${cx + 18},60 ${cx + 18},80 ${cx},90 ${cx - 18},80 ${cx - 18},60`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          transform={`rotate(${-rot * 1.2} ${cx} ${cy})`}
        />
      );
    } else {
      // Triangle
      mainShape = (
        <polygon
          points={`${cx},30 ${cx + 35},105 ${cx - 35},105`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.0"
          transform={`rotate(${rot} ${cx} ${cy})`}
        />
      );
      innerShape = (
        <polygon
          points={`${cx},50 ${cx + 20},92 ${cx - 20},92`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          transform={`rotate(${-rot * 1.2} ${cx} ${cy})`}
        />
      );
    }

    pattern = (
      <>
        {mainShape}
        {innerShape}
      </>
    );
  } else {
    // 40 small circles (r=1.0, fill) scattered within viewBox bounds, vary opacity 0.5..1.0
    pattern = (
      <>
        {[...Array(40)].map((_, i) => {
          const cx = ((seed * (i + 1) * 19 + offA * 3) % 86) + 7;
          const cy = ((seed * (i + 1) * 29 + offB * 5 + offC) % 126) + 7;
          const op = 0.5 + (((seed + i * 13) % 50) / 100);
          return (
            <circle
              key={`dot-${i}`}
              cx={cx}
              cy={cy}
              r="1.0"
              fill="currentColor"
              opacity={op}
            />
          );
        })}
      </>
    );
  }

  return (
    <svg
      className={`book-cover-art book-cover-art-${family}`}
      viewBox="0 0 100 140"
      preserveAspectRatio="none"
      aria-hidden="true"
      style={{ ['--book-cover-rot' as any]: `${rot}deg` }}
    >
      {pattern}
    </svg>
  );
}

