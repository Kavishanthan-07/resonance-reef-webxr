import {
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
} from 'three';

import type { BreathState } from '../breathing/BreathEngine.js';

interface FishAgent {
  root: Group;
  tail: Mesh;
  velocity: Vector3;
  phaseOffset: number;
  outwardBias: Vector3;
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function smoothStep(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

/**
 * Lightweight procedural fish school.
 *
 * The fish use:
 * - cohesion
 * - separation
 * - breath attraction / repulsion
 * - soft environment boundaries
 *
 * No physics engine or external models are required.
 */
export class FishSchool {
  readonly root = new Group();

  private readonly fish: FishAgent[] = [];

  /*
   * Important world-space reference points.
   */
  private readonly userPoint = new Vector3(0, 1.6, 0);

  private readonly inhaleTarget = new Vector3(
    0,
    1.55,
    -1.35,
  );

  private readonly reefCenter = new Vector3(
    0,
    1.5,
    -3.2,
  );

  /*
   * Reusable vectors.
   *
   * These avoid creating lots of temporary objects every frame.
   */
  private readonly centroid = new Vector3();
  private readonly steering = new Vector3();
  private readonly separation = new Vector3();
  private readonly difference = new Vector3();
  private readonly breathForce = new Vector3();
  private readonly boundaryForce = new Vector3();
  private readonly lookTarget = new Vector3();

  constructor(count = 24) {
    this.root.name = 'ResonanceReefFishSchool';

    const bodyGeometry = new SphereGeometry(
      0.11,
      8,
      6,
    );

    const bodyMaterial = new MeshBasicMaterial({
      color: 0x65dff3,
    });

    const tailMaterial = new MeshBasicMaterial({
      color: 0x38aeca,
      side: DoubleSide,
    });

    /*
     * One triangular tail geometry shared by all fish.
     *
     * Local +Z is treated as the fish's forward direction.
     */
    const tailGeometry = new BufferGeometry();

    tailGeometry.setAttribute(
      'position',
      new Float32BufferAttribute(
        [
          0, -0.09, 0,
          0, 0.09, 0,
          0, 0, -0.16,
        ],
        3,
      ),
    );

    for (let index = 0; index < count; index += 1) {
      const fishRoot = new Group();

      fishRoot.name = `Fish-${index}`;

      /*
       * Body.
       */
      const body = new Mesh(
        bodyGeometry,
        bodyMaterial,
      );

      body.scale.set(
        0.65,
        0.45,
        1.45,
      );

      fishRoot.add(body);

      /*
       * Tail.
       */
      const tail = new Mesh(
        tailGeometry,
        tailMaterial,
      );

      tail.position.z = -0.18;

      fishRoot.add(tail);

      /*
       * Spawn the entire school in front of the user.
       */
      fishRoot.position.set(
        randomRange(-1.6, 1.6),
        randomRange(0.85, 2.25),
        randomRange(-4.2, -2.0),
      );

      /*
       * Slight size variation prevents the school from looking cloned.
       */
      const scale = randomRange(0.75, 1.15);

      fishRoot.scale.setScalar(scale);

      const velocity = new Vector3(
        randomRange(-0.15, 0.15),
        randomRange(-0.04, 0.04),
        randomRange(-0.35, -0.12),
      );

      if (velocity.lengthSq() === 0) {
        velocity.z = -0.2;
      }

      velocity
        .normalize()
        .multiplyScalar(
          randomRange(0.18, 0.3),
        );

      /*
       * Gives each fish a preferred outward direction during exhale.
       */
      const outwardBias = new Vector3(
        randomRange(-1, 1),
        randomRange(-0.35, 0.35),
        randomRange(-0.6, -0.15),
      ).normalize();

      this.fish.push({
        root: fishRoot,
        tail,
        velocity,
        phaseOffset: Math.random() * Math.PI * 2,
        outwardBias,
      });

      this.root.add(fishRoot);
    }
  }

  update(
    state: BreathState,
    deltaSeconds: number,
    timeSeconds: number,
  ): void {
    if (this.fish.length === 0) {
      return;
    }

    /*
     * Find the current center of the school.
     */
    this.centroid.set(0, 0, 0);

    for (const agent of this.fish) {
      this.centroid.add(agent.root.position);
    }

    this.centroid.multiplyScalar(
      1 / this.fish.length,
    );

    const breathProgress = smoothStep(
      state.progress,
    );

    for (
      let fishIndex = 0;
      fishIndex < this.fish.length;
      fishIndex += 1
    ) {
      const agent = this.fish[fishIndex];

      this.steering.set(0, 0, 0);
      this.separation.set(0, 0, 0);

      /*
       * -------------------------------------------------
       * 1. SCHOOL COHESION
       * -------------------------------------------------
       *
       * Fish gently move toward the group's center.
       */
      this.difference
        .copy(this.centroid)
        .sub(agent.root.position);

      if (this.difference.lengthSq() > 0.0001) {
        this.difference.normalize();

        this.steering.addScaledVector(
          this.difference,
          0.18,
        );
      }

      /*
       * -------------------------------------------------
       * 2. SEPARATION
       * -------------------------------------------------
       *
       * Prevent fish from collapsing into one point.
       */
      for (
        let otherIndex = 0;
        otherIndex < this.fish.length;
        otherIndex += 1
      ) {
        if (otherIndex === fishIndex) {
          continue;
        }

        const other =
          this.fish[otherIndex];

        this.difference
          .copy(agent.root.position)
          .sub(other.root.position);

        const distanceSquared =
          this.difference.lengthSq();

        if (
          distanceSquared > 0 &&
          distanceSquared < 0.16
        ) {
          /*
           * Closer fish create stronger separation.
           */
          this.difference
            .normalize()
            .multiplyScalar(
              1 / Math.max(
                distanceSquared,
                0.025,
              ),
            );

          this.separation.add(
            this.difference,
          );
        }
      }

      if (this.separation.lengthSq() > 0) {
        this.separation.normalize();

        this.steering.addScaledVector(
          this.separation,
          0.55,
        );
      }

      /*
       * -------------------------------------------------
       * 3. BREATH RESPONSE
       * -------------------------------------------------
       */
      if (state.phase === 'inhale') {
        /*
         * During inhale, the fish are attracted toward a point
         * in front of the user's body.
         *
         * They never target the exact headset position.
         */
        this.breathForce
          .copy(this.inhaleTarget)
          .sub(agent.root.position);

        if (
          this.breathForce.lengthSq() > 0.001
        ) {
          this.breathForce.normalize();

          this.steering.addScaledVector(
            this.breathForce,
            0.65 + breathProgress * 0.85,
          );
        }
      } else {
        /*
         * During exhale, move away from the user.
         */
        this.breathForce
          .copy(agent.root.position)
          .sub(this.userPoint);

        if (
          this.breathForce.lengthSq() > 0.001
        ) {
          this.breathForce.normalize();

          this.steering.addScaledVector(
            this.breathForce,
            0.8 + breathProgress * 1.25,
          );
        }

        /*
         * Add individual outward direction so the fish fan out
         * instead of moving as one rigid ball.
         */
        this.steering.addScaledVector(
          agent.outwardBias,
          0.35 + breathProgress * 0.45,
        );
      }

      /*
       * -------------------------------------------------
       * 4. SOFT REEF BOUNDARY
       * -------------------------------------------------
       *
       * We allow fish to disappear somewhat during exhale,
       * but prevent the school from escaping forever.
       */
      const outsideBoundary =
        Math.abs(agent.root.position.x) > 4.2 ||
        agent.root.position.y < 0.35 ||
        agent.root.position.y > 3.1 ||
        agent.root.position.z < -6.0 ||
        agent.root.position.z > -0.8;

      if (outsideBoundary) {
        this.boundaryForce
          .copy(this.reefCenter)
          .sub(agent.root.position);

        if (
          this.boundaryForce.lengthSq() > 0.001
        ) {
          this.boundaryForce.normalize();

          this.steering.addScaledVector(
            this.boundaryForce,
            1.4,
          );
        }
      }

      /*
       * -------------------------------------------------
       * 5. UPDATE VELOCITY
       * -------------------------------------------------
       */
      agent.velocity.addScaledVector(
        this.steering,
        deltaSeconds,
      );

      const maxSpeed =
        state.phase === 'inhale'
          ? 0.62
          : 0.95;

      const currentSpeed =
        agent.velocity.length();

      if (currentSpeed > maxSpeed) {
        agent.velocity.setLength(maxSpeed);
      }

      if (
        currentSpeed < 0.12 &&
        currentSpeed > 0
      ) {
        agent.velocity.setLength(0.12);
      }

      /*
       * Mild damping smooths sudden steering changes.
       */
      const damping = Math.pow(
        0.985,
        deltaSeconds * 60,
      );

      agent.velocity.multiplyScalar(
        damping,
      );

      /*
       * -------------------------------------------------
       * 6. MOVE
       * -------------------------------------------------
       */
      agent.root.position.addScaledVector(
        agent.velocity,
        deltaSeconds,
      );

      /*
       * Small vertical swimming motion.
       */
      agent.root.position.y +=
        Math.sin(
          timeSeconds * 1.25 +
            agent.phaseOffset,
        ) *
        0.00045;

      /*
       * -------------------------------------------------
       * 7. ORIENTATION
       * -------------------------------------------------
       */
      if (
        agent.velocity.lengthSq() > 0.0001
      ) {
        this.lookTarget
          .copy(agent.root.position)
          .add(agent.velocity);

        agent.root.lookAt(
          this.lookTarget,
        );
      }

      /*
       * Tail movement becomes slightly faster on exhale.
       */
      const tailSpeed =
        state.phase === 'inhale'
          ? 6
          : 8;

      agent.tail.rotation.y =
        Math.sin(
          timeSeconds * tailSpeed +
            agent.phaseOffset,
        ) * 0.55;
    }
  }
}