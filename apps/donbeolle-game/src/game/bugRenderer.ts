import type Matter from 'matter-js';

/**
 * Draws the bug as a capsule body with 6 pairs of wiggling legs and antennae,
 * ported 1:1 from the design prototype's afterRender drawing code. Must not be
 * replaced with a plain circle - the physics collider stays circular, but the
 * visual silhouette is this long many-legged shape.
 */
export function drawBug(ctx: CanvasRenderingContext2D, body: Matter.Body, noiseTime: number): void {
  const bodyLength = 58;
  const bodyWidth = 17;

  ctx.save();
  ctx.translate(body.position.x, body.position.y);
  ctx.rotate(body.angle);

  const legPairs = 6;
  const legLen = 16;
  ctx.strokeStyle = '#3a1f1a';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (let i = 0; i < legPairs; i++) {
    const t = (i / (legPairs - 1) - 0.5) * (bodyLength * 0.82);
    const wig = Math.sin(noiseTime * 1.5 + i * 1.1) * 5;
    ctx.beginPath();
    ctx.moveTo(t, -bodyWidth / 2 + 2);
    ctx.lineTo(t - 7, -bodyWidth / 2 - legLen + wig);
    ctx.moveTo(t, bodyWidth / 2 - 2);
    ctx.lineTo(t - 7, bodyWidth / 2 + legLen - wig);
    ctx.stroke();
  }

  ctx.fillStyle = '#5c2a1a';
  ctx.strokeStyle = '#2a1006';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(-bodyLength / 2, -bodyWidth / 2, bodyLength, bodyWidth, bodyWidth / 2);
  } else {
    ctx.rect(-bodyLength / 2, -bodyWidth / 2, bodyLength, bodyWidth);
  }
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.fillStyle = '#3a1810';
  ctx.arc(bodyLength / 2, 0, bodyWidth * 0.42, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#2a1006';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bodyLength / 2, -3);
  ctx.lineTo(bodyLength / 2 + 11, -11);
  ctx.moveTo(bodyLength / 2, 3);
  ctx.lineTo(bodyLength / 2 + 11, 11);
  ctx.stroke();

  ctx.restore();
}
