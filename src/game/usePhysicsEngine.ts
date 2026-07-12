import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import Matter from 'matter-js';
import {
  WIDTH,
  HEIGHT,
  PLANK_LENGTH,
  PLANK_THICK,
  BOARD_DATA,
  EXIT_META,
  WALL_RECTS,
  BUG_SPEED,
} from './constants';
import { computePivotOffset } from './pivot';
import { drawBug } from './bugRenderer';
import type { ExitMeta, Phase } from './types';

const { Engine, Render, Runner, Bodies, Composite, Body, Vector, Events, Bounds } = Matter;

interface UsePhysicsEngineOptions {
  containerRef: RefObject<HTMLDivElement>;
  phase: Phase;
  onEscape: (exit: ExitMeta) => void;
}

export function usePhysicsEngine({ containerRef, phase, onEscape }: UsePhysicsEngineOptions): void {
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const prevPhaseRef = useRef<Phase>(phase);
  const bugRef = useRef<Matter.Body | null>(null);
  const isPlayingRef = useRef(false);
  const noiseTimeRef = useRef(0);
  const stuckTimerRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const engine = Engine.create({ gravity: { x: 0, y: 0 } });

    const render = Render.create({
      element: container,
      engine,
      options: { width: WIDTH, height: HEIGHT, wireframes: false, background: '#4a3525' },
    });
    Render.run(render);
    render.canvas.style.width = '100%';
    render.canvas.style.height = '100%';

    const runner = Runner.create();
    Runner.run(runner, engine);

    const wallOptions = {
      isStatic: true,
      render: { fillStyle: '#2b1d11' },
      friction: 0,
      restitution: 0.5,
    };
    const walls = WALL_RECTS.map((w) => Bodies.rectangle(w.x, w.y, w.width, w.height, wallOptions));
    Composite.add(engine.world, walls);

    const exitSensors = EXIT_META.map((meta) =>
      Bodies.rectangle(meta.side === 'left' ? -5 : WIDTH + 5, meta.y, 40, 110, {
        isStatic: true,
        isSensor: true,
        render: { fillStyle: '#1a1a1a', strokeStyle: '#ffcc00', lineWidth: 1 },
      })
    );
    Composite.add(engine.world, exitSensors);

    const planks = BOARD_DATA.map((data) => {
      const angle = data.state === 1 ? Math.PI / 2 : 0;
      const plank = Bodies.rectangle(data.x, data.y, PLANK_THICK, PLANK_LENGTH, {
        isStatic: true,
        angle,
        friction: 0,
        restitution: 0.4,
        render: { fillStyle: '#8b7355', strokeStyle: '#5c4033', lineWidth: 2 },
      });
      const worldOffset = computePivotOffset(angle);
      Body.setCentre(plank, worldOffset, true);
      return plank;
    });
    Composite.add(engine.world, planks);

    const bug = Bodies.circle(WIDTH / 2, HEIGHT / 2, 14, {
      friction: 0,
      frictionAir: 0,
      restitution: 0.5,
      render: { visible: false },
    });
    Composite.add(engine.world, bug);
    bugRef.current = bug;

    Events.on(render, 'afterRender', () => {
      drawBug(render.context, bug, noiseTimeRef.current);
    });

    Events.on(engine, 'beforeUpdate', () => {
      if (!isPlayingRef.current) return;

      const angle = bug.angle;
      Body.applyForce(bug, bug.position, {
        x: Math.sin(angle) * BUG_SPEED,
        y: -Math.cos(angle) * BUG_SPEED,
      });

      noiseTimeRef.current += 0.25;
      const wobble = Math.sin(noiseTimeRef.current) * Math.cos(noiseTimeRef.current * 0.8) * 0.035;
      Body.setAngularVelocity(bug, bug.angularVelocity + wobble);

      if (Vector.magnitude(bug.velocity) < 0.5) {
        stuckTimerRef.current++;
        if (stuckTimerRef.current > 40) {
          Body.setAngle(bug, bug.angle + Math.PI + (Math.random() - 0.5));
          Body.setVelocity(bug, { x: (Math.random() - 0.5) * 5, y: (Math.random() - 0.5) * 5 });
          stuckTimerRef.current = 0;
        }
      } else {
        stuckTimerRef.current = 0;
      }

      exitSensors.forEach((sensor, i) => {
        if (Bounds.contains(sensor.bounds, bug.position)) {
          isPlayingRef.current = false;
          Body.setVelocity(bug, { x: 0, y: 0 });
          onEscapeRef.current(EXIT_META[i]);
        }
      });
    });

    render.canvas.addEventListener('click', (e) => {
      if (phaseRef.current !== 'setup') return;
      const rect = render.canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left) * (WIDTH / rect.width);
      const my = (e.clientY - rect.top) * (HEIGHT / rect.height);
      planks.forEach((plank) => {
        if (Bounds.contains(plank.bounds, { x: mx, y: my })) {
          Body.setAngle(plank, plank.angle + Math.PI / 2);
        }
      });
    });

    return () => {
      Render.stop(render);
      Runner.stop(runner);
      Engine.clear(engine);
      render.canvas.remove();
    };
  }, [containerRef]);

  useEffect(() => {
    if (phase === 'running' && prevPhaseRef.current !== 'running') {
      const bug = bugRef.current;
      if (bug) {
        Body.setPosition(bug, { x: WIDTH / 2, y: HEIGHT / 2 });
        Body.setAngle(bug, Math.random() * Math.PI * 2);
        Body.setVelocity(bug, { x: 0, y: 0 });
        noiseTimeRef.current = 0;
        stuckTimerRef.current = 0;
        isPlayingRef.current = true;
      }
    }
    prevPhaseRef.current = phase;
  }, [phase]);
}
