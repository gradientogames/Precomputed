function generateMosaicFromElement(element: HTMLElement): void {
  const text = element.textContent?.trim();
  if (!text) return;

  const style = getComputedStyle(element);
  const fontSize = parseFloat(style.fontSize);
  const fontFamily = style.fontFamily;
  const fontWeight = style.fontWeight;
  const padding = 0;

  const rootStyle = getComputedStyle(document.documentElement);
  const resolutionVar = rootStyle.getPropertyValue("--mosaic-resolution").trim();
  const resolution = parseInt(resolutionVar || "1", 10);
  const cellSizeVar = rootStyle.getPropertyValue("--mosaic-cell-size").trim();
  const cellSize = parseFloat(cellSizeVar) || 3;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(text);

  canvas.width = Math.ceil(metrics.width) + padding * 2;
  canvas.height = Math.ceil(fontSize * 1.4) + padding * 2;

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = "white";
  ctx.textBaseline = "top";
  ctx.fillText(text, padding, padding);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { data, width, height } = imageData;

  // Build a boolean grid for filled pixels
  const cols = Math.floor(width / resolution);
  const rows = Math.floor(height / resolution);
  const grid: boolean[][] = [];
  for (let y = 0; y < rows; y++) {
    grid[y] = [];
    for (let x = 0; x < cols; x++) {
      let sumAlpha = 0;
      for (let yy = 0; yy < resolution; yy++) {
        for (let xx = 0; xx < resolution; xx++) {
          const px = x * resolution + xx;
          const py = y * resolution + yy;
          if (px >= width || py >= height) continue;
          const index = (py * width + px) * 4;
          sumAlpha += data[index + 3];
        }
      }
      const avgAlpha = sumAlpha / (resolution * resolution);
      grid[y][x] = avgAlpha > 70;
    }
  }

  // Create mosaic container
  const mosaic = document.createElement("div");
  element.classList.forEach(element => {
    mosaic.classList.add(element);
  });
  mosaic.classList.remove("mosaic-text");
  mosaic.classList.add("mosaic");
  mosaic.style.width = `${cols * cellSize}px`;
  mosaic.style.height = `${rows * cellSize}px`;

  const frag = document.createDocumentFragment();
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

  // Greedy meshing
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (!grid[y][x] || visited[y][x]) continue;

      // --- Replace the original width/height expansion code with this block ---
      let w = 1;
      let h = 1;
      let canExpand = true;

      while (canExpand) {
        const aspect = w / h;
        const expandHoriz = aspect <= 1; // prefer width when narrow
        const expandVert = aspect >= 1;  // prefer height when wide

        if (expandHoriz && x + w < cols) {
          let ok = true;
          for (let j = 0; j < h; j++) {
            if (!grid[y + j][x + w] || visited[y + j][x + w]) { ok = false; break; }
          }
          if (ok) { w++; continue; }
        }

        if (expandVert && y + h < rows) {
          let ok = true;
          for (let i = 0; i < w; i++) {
            if (!grid[y + h][x + i] || visited[y + h][x + i]) { ok = false; break; }
          }
          if (ok) { h++; continue; }
        }

        canExpand = false;
      }

      // Mark visited
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          visited[y + dy][x + dx] = true;
        }
      }

      // Create a single div for this block using absolute positioning
      const pixel = document.createElement("div");
      pixel.className = "pixel filled";
      pixel.style.position = "absolute";
      pixel.style.left = `${x * cellSize}px`;
      pixel.style.top = `${y * cellSize}px`;
      pixel.style.width = `${w * cellSize}px`;
      pixel.style.height = `${h * cellSize}px`;
      pixel.style.animationDelay = `${(Math.random() * 3000 + 500).toFixed(0)}ms`;
      pixel.style.setProperty("--x", x.toString());
      pixel.style.setProperty("--y", y.toString());
      pixel.onanimationend = () => { pixel.remove();}
      frag.appendChild(pixel);
    }
  }

  mosaic.appendChild(frag);
  element.parentElement?.appendChild(mosaic);
}

export function applyMosaicToTextElements(): void {
  const elements = document.querySelectorAll<HTMLElement>(".mosaic-text");
  elements.forEach(el => generateMosaicFromElement(el));
}
