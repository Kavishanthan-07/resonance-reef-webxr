import type { BreathState } from '../breathing/BreathEngine.js';
import type { CurrentSample } from '../ocean/WaterCurrent.js';

interface ReefCue {
  panner: PannerNode;
  gain: GainNode;
  filter: BiquadFilterNode;
  position: readonly [number, number, number];
  nextTickTime: number;
  impact: number;
  hitPulseId: number;
  seed: number;
}

const MASTER_GAIN = 0.28;
const AMBIENCE_GAIN = 0.42;
const WHOOSH_GAIN = 0.30;
const DEBUG_AUDIO = false;

const REEF_CUE_POSITIONS = [
  [-2.5, 1.0, -3.5],
  [2.2, 1.2, -4.0],
  [-1.0, 1.8, -5.0],
  [1.5, 0.8, -5.5],
] as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(value: number): number {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function setParam(
  param: AudioParam,
  value: number,
  time: number,
  glide = 0.18,
): void {
  param.setTargetAtTime(value, time, glide);
}

function setPannerPosition(
  panner: PannerNode,
  x: number,
  y: number,
  z: number,
  time: number,
): void {
  if (
    panner.positionX != null &&
    panner.positionY != null &&
    panner.positionZ != null
  ) {
    setParam(panner.positionX, x, time, 0.08);
    setParam(panner.positionY, y, time, 0.08);
    setParam(panner.positionZ, z, time, 0.08);
  } else {
    panner.setPosition(x, y, z);
  }
}

export class ProceduralAudio {
  readonly masterGainValue = MASTER_GAIN;

  readonly reefCueCount = REEF_CUE_POSITIONS.length;

  private readonly masterGain: GainNode;
  private readonly ambienceGain: GainNode;
  private readonly ambienceFilter: BiquadFilterNode;
  private readonly toneGain: GainNode;
  private readonly toneFilter: BiquadFilterNode;
  private readonly whooshGain: GainNode;
  private readonly whooshFilter: BiquadFilterNode;
  private readonly whooshPanner: PannerNode;
  private readonly reefCues: ReefCue[] = [];
  private readonly startedSources: string[] = [];

  private masterDestinationConnections = 0;
  private muted = false;

  constructor(private readonly context: AudioContext) {
    this.masterGain = context.createGain();
    this.masterGain.gain.value = MASTER_GAIN;
    this.masterGain.connect(context.destination);
    this.masterDestinationConnections += 1;

    const noiseBuffer = this.createNoiseBuffer(2.5);

    const ambienceSource =
      context.createBufferSource();
    ambienceSource.buffer = noiseBuffer;
    ambienceSource.loop = true;

    this.ambienceFilter =
      context.createBiquadFilter();
    this.ambienceFilter.type = 'lowpass';
    this.ambienceFilter.frequency.value = 720;
    this.ambienceFilter.Q.value = 0.45;

    this.ambienceGain = context.createGain();
    this.ambienceGain.gain.value = AMBIENCE_GAIN;

    ambienceSource
      .connect(this.ambienceFilter)
      .connect(this.ambienceGain)
      .connect(this.masterGain);
    ambienceSource.start();
    this.startedSources.push(
      'ambience AudioBufferSourceNode',
    );

    const toneA = context.createOscillator();
    const toneB = context.createOscillator();
    toneA.type = 'triangle';
    toneB.type = 'sine';
    toneA.frequency.value = 110;
    toneB.frequency.value = 146;
    toneB.detune.value = -7;

    this.toneFilter = context.createBiquadFilter();
    this.toneFilter.type = 'lowpass';
    this.toneFilter.frequency.value = 210;
    this.toneFilter.Q.value = 0.36;

    this.toneGain = context.createGain();
    this.toneGain.gain.value = 0.018;

    toneA.connect(this.toneFilter);
    toneB.connect(this.toneFilter);
    this.toneFilter
      .connect(this.toneGain)
      .connect(this.masterGain);
    toneA.start();
    toneB.start();
    this.startedSources.push(
      'toneA OscillatorNode',
      'toneB OscillatorNode',
    );

    const whooshSource =
      context.createBufferSource();
    whooshSource.buffer = noiseBuffer;
    whooshSource.loop = true;

    this.whooshFilter = context.createBiquadFilter();
    this.whooshFilter.type = 'bandpass';
    this.whooshFilter.frequency.value = 260;
    this.whooshFilter.Q.value = 0.62;

    this.whooshGain = context.createGain();
    this.whooshGain.gain.value = 0;

    this.whooshPanner = this.createPanner();
    setPannerPosition(
      this.whooshPanner,
      0,
      1.4,
      -0.2,
      context.currentTime,
    );

    whooshSource
      .connect(this.whooshFilter)
      .connect(this.whooshGain)
      .connect(this.whooshPanner)
      .connect(this.masterGain);
    whooshSource.start();
    this.startedSources.push(
      'whoosh AudioBufferSourceNode',
    );

    for (const position of REEF_CUE_POSITIONS) {
      this.reefCues.push(
        this.createReefCue(noiseBuffer, position),
      );
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    const now = this.context.currentTime;

    setParam(
      this.masterGain.gain,
      muted ? 0 : MASTER_GAIN,
      now,
      0.08,
    );
  }

  getDiagnosticSnapshot(): {
    ambienceGain: number;
    currentGain: number;
    masterConnectedToDestination: boolean;
    masterDestinationConnections: number;
    masterGain: number;
    sourceStarts: string[];
  } {
    return {
      ambienceGain: this.ambienceGain.gain.value,
      currentGain: this.whooshGain.gain.value,
      masterConnectedToDestination:
        this.masterDestinationConnections === 1,
      masterDestinationConnections:
        this.masterDestinationConnections,
      masterGain: this.masterGain.gain.value,
      sourceStarts: [...this.startedSources],
    };
  }

  update(
    state: BreathState,
    current: CurrentSample,
    deltaSeconds: number,
    timeSeconds: number,
  ): void {
    const now = this.context.currentTime;
    const progress = smoothStep(state.progress);
    const inhale =
      state.phase === 'inhale' ? progress : 0;
    const exhale =
      state.phase === 'exhale' ? progress : 0;

    if (!this.muted) {
      setParam(
        this.masterGain.gain,
        MASTER_GAIN,
        now,
        0.12,
      );
    }

    setParam(
      this.ambienceGain.gain,
      AMBIENCE_GAIN - inhale * 0.035 + exhale * 0.018,
      now,
      0.28,
    );
    setParam(
      this.ambienceFilter.frequency,
      900 - inhale * 180 + exhale * 140,
      now,
      0.32,
    );
    setParam(
      this.toneGain.gain,
      0.002 + inhale * 0.018,
      now,
      0.35,
    );
    setParam(
      this.toneFilter.frequency,
      190 + inhale * 45,
      now,
      0.42,
    );

    const currentStrength =
      current.phase === 'expanding'
        ? current.strength
        : 0;
    const whooshGain =
      Math.min(
        WHOOSH_GAIN,
        currentStrength * 0.52,
      ) *
      (0.85 + exhale * 0.15);

    setParam(
      this.whooshGain.gain,
      whooshGain,
      now,
      0.16,
    );
    setParam(
      this.whooshFilter.frequency,
      230 + currentStrength * 280,
      now,
      0.22,
    );
    setPannerPosition(
      this.whooshPanner,
      current.origin.x,
      current.origin.y,
      current.origin.z - current.radius * 0.32,
      now,
    );

    for (const cue of this.reefCues) {
      this.updateReefCue(
        cue,
        current,
        deltaSeconds,
        timeSeconds,
        now,
      );
    }
  }

  private createNoiseBuffer(
    seconds: number,
  ): AudioBuffer {
    const length =
      Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(
      1,
      length,
      this.context.sampleRate,
    );
    const data = buffer.getChannelData(0);
    let previous = 0;

    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.985 + white * 0.015;

      data[index] = Math.max(
        -1,
        Math.min(1, previous * 3.0),
      );
    }

    return buffer;
  }

  private createPanner(): PannerNode {
    return new PannerNode(this.context, {
      coneInnerAngle: 180,
      coneOuterAngle: 270,
      coneOuterGain: 0.45,
      distanceModel: 'inverse',
      maxDistance: 9,
      panningModel: 'HRTF',
      refDistance: 1.8,
      rolloffFactor: 0.35,
    });
  }

  private createReefCue(
    noiseBuffer: AudioBuffer,
    position: readonly [number, number, number],
  ): ReefCue {
    const source = this.context.createBufferSource();
    source.buffer = noiseBuffer;
    source.loop = true;

    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = randomRange(820, 1450);
    filter.Q.value = randomRange(1.8, 3.2);

    const gain = this.context.createGain();
    gain.gain.value = 0;

    const panner = this.createPanner();
    setPannerPosition(
      panner,
      position[0],
      position[1],
      position[2],
      this.context.currentTime,
    );

    source
      .connect(filter)
      .connect(gain)
      .connect(panner)
      .connect(this.masterGain);
    source.start();
    this.startedSources.push(
      `reef cue AudioBufferSourceNode ${this.reefCues.length}`,
    );

    return {
      filter,
      gain,
      hitPulseId: 0,
      impact: 0,
      nextTickTime:
        this.context.currentTime + randomRange(1.1, 3.4),
      panner,
      position,
      seed: Math.random() * Math.PI * 2,
    };
  }

  private updateReefCue(
    cue: ReefCue,
    current: CurrentSample,
    deltaSeconds: number,
    timeSeconds: number,
    now: number,
  ): void {
    cue.impact =
      cue.impact > 0.001
        ? cue.impact *
          Math.pow(0.045, deltaSeconds / 1.45)
        : 0;

    if (
      current.phase === 'expanding' &&
      current.strength > 0.002 &&
      cue.hitPulseId !== current.pulseId
    ) {
      const dx = cue.position[0] - current.origin.x;
      const dy = cue.position[1] - current.origin.y;
      const dz = cue.position[2] - current.origin.z;
      const distance =
        Math.sqrt(dx * dx + dy * dy + dz * dz);
      const shellOffset =
        Math.abs(distance - current.radius);

      if (
        distance > 0.001 &&
        shellOffset < current.shellThickness
      ) {
        cue.impact = Math.max(
          cue.impact,
          (1 - shellOffset / current.shellThickness) *
            current.strength,
        );
        cue.nextTickTime = Math.min(
          cue.nextTickTime,
          now + randomRange(0.03, 0.16),
        );
        cue.hitPulseId = current.pulseId;

        if (DEBUG_AUDIO) {
          console.log(
            '[Resonance Reef] Audio cue reached by current.',
          );
        }
      }
    }

    if (now >= cue.nextTickTime) {
      const intensity =
        0.014 +
        cue.impact * 0.045 +
        Math.sin(
          timeSeconds * 0.17 + cue.seed,
        ) * 0.003;

      const peak =
        Math.max(
          0.008,
          Math.min(0.06, intensity),
        );

      cue.gain.gain.cancelScheduledValues(now);
      cue.gain.gain.setValueAtTime(
        cue.gain.gain.value,
        now,
      );
      cue.gain.gain.linearRampToValueAtTime(
        peak,
        now + randomRange(0.012, 0.028),
      );
      cue.gain.gain.exponentialRampToValueAtTime(
        0.0001,
        now + randomRange(0.18, 0.42),
      );
      setParam(
        cue.filter.frequency,
        randomRange(720, 1650),
        now,
        0.03,
      );

      const baseInterval =
        randomRange(1.8, 4.8);
      const activeInterval =
        randomRange(0.45, 1.35);
      cue.nextTickTime =
        now +
        baseInterval * (1 - cue.impact) +
        activeInterval * cue.impact;
    }
  }
}
