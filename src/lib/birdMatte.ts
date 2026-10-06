/** Remove the connected white studio background, retaining interior highlights.
 * The edge pass removes white spill from partially covered feather pixels. */
export function refineBirdMatte(image: ImageData) {
  const { data: pixels, width, height } = image;
  const count = width * height;
  const background = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0, tail = 0;
  const enqueue = (index: number) => {
    if (background[index]) return;
    const i = index * 4;
    const minimum = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
    const maximum = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (minimum > 145 && maximum - minimum < 65) {
      background[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < width; x++) { enqueue(x); enqueue(count - width + x); }
  for (let y = 0; y < height; y++) { enqueue(y * width); enqueue(y * width + width - 1); }
  while (head < tail) {
    const index = queue[head++], x = index % width;
    if (x > 0) enqueue(index - 1);
    if (x < width - 1) enqueue(index + 1);
    if (index >= width) enqueue(index - width);
    if (index < count - width) enqueue(index + width);
  }
  // Large enclosed white gaps (under the wing or inside the running trail)
  // are also backdrop. Keep small enclosed highlights, including the eyes.
  const visited = background.slice();
  const enclosed = (index: number) => {
    if (visited[index]) return;
    const i = index * 4;
    const minimum = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
    const maximum = Math.max(pixels[i], pixels[i + 1], pixels[i + 2]);
    if (minimum > 200 && maximum - minimum < 45) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let seed = 0; seed < count; seed++) {
    if (visited[seed]) continue;
    head = 0; tail = 0; enclosed(seed);
    while (head < tail) {
      const index = queue[head++], x = index % width;
      if (x > 0) enclosed(index - 1);
      if (x < width - 1) enclosed(index + 1);
      if (index >= width) enclosed(index - width);
      if (index < count - width) enclosed(index + width);
    }
    if (tail > count * 0.0015) {
      for (let j = 0; j < tail; j++) background[queue[j]] = 1;
    }
  }
  for (let index = 0; index < count; index++) {
    const i = index * 4;
    if (background[index]) { pixels[i + 3] = 0; continue; }
    const x = index % width, y = Math.floor(index / width);
    let edge = false;
    for (let dy = -1; dy <= 1 && !edge; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (x + dx >= 0 && x + dx < width && y + dy >= 0 && y + dy < height && background[index + dy * width + dx]) { edge = true; break; }
      }
    }
    if (!edge) continue;
    const minimum = Math.min(pixels[i], pixels[i + 1], pixels[i + 2]);
    // Bright edge pixels contain white from the studio: unmix that white.
    const alpha = Math.max(0.12, 1 - minimum / 255);
    for (let channel = 0; channel < 3; channel++) {
      pixels[i + channel] = Math.max(0, Math.min(255, (pixels[i + channel] - 255 * (1 - alpha)) / alpha));
    }
    pixels[i + 3] = Math.round(alpha * 255);
  }
  return image;
}
