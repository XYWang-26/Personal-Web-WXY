// Scroll is the only source of propulsion. A released stroke settles at its rest pose.
export const MOTION_SETTINGS = Object.freeze({
    slowPeriod: 2.9,
    fastPeriod: 2.2,
    inputHold: 0.22,
    inputDecay: 0.24,
    journeySeconds: 28
});

const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));
const smooth = value => value * value * (3 - 2 * value);

function channel(phase, keys) {
    for (let i = 1; i < keys.length; i += 1) {
        if (phase <= keys[i][0]) {
            const a = keys[i - 1];
            const b = keys[i];
            return a[1] + (b[1] - a[1]) * smooth(clamp((phase - a[0]) / (b[0] - a[0])));
        }
    }
    return keys[keys.length - 1][1];
}

export function strokePose(phase, amplitude = 1) {
    return {
        // The hands move first on recovery; torso follows. The drive reverses this order.
        sweep: amplitude * channel(phase, [[0, 0], [0.17, -0.11], [0.24, -0.11], [0.55, 0.22], [0.65, 0.22], [0.88, 0], [1, 0]]),
        lift: amplitude * channel(phase, [[0, 0], [0.13, 3], [0.22, 0], [0.53, 0], [0.63, -9], [0.84, -7], [1, 0]]),
        feather: channel(phase, [[0, 0], [0.15, 0], [0.24, 1], [0.54, 1], [0.64, 0], [1, 0]]),
        roll: channel(phase, [[0, 0], [0.54, 0], [0.66, 1], [0.87, 1], [1, 0]]),
        lean: amplitude * channel(phase, [[0, 0], [0.19, -3], [0.42, 5], [0.63, 5], [0.86, 3], [1, 0]]),
        water: channel(phase, [[0, 0], [0.2, 0], [0.25, 1], [0.54, 1], [0.65, 0], [1, 0]]),
        stage: phase < 0.22 ? 'catch' : phase < 0.55 ? 'drive' : phase < 0.65 ? 'release' : 'recovery'
    };
}

export class RowingMotion {
    constructor() {
        this.phase = 0;
        this.intensity = 0;
        this.drive = 0;
        this.sinceInput = Infinity;
        this.active = false;
        this.finishing = false;
        this.cycles = 0;
        this.progress = 0;
        this.distance = 0;
        this.period = MOTION_SETTINGS.slowPeriod;
        this.pose = strokePose(0, 0);
    }

    input(pixels) {
        if (!(pixels > 0)) return;
        this.drive = clamp(this.drive + pixels / 500);
        this.sinceInput = 0;
        this.active = true;
        this.finishing = false;
    }

    update(delta) {
        const dt = clamp(delta, 0, 0.05);
        this.sinceInput += dt;
        this.drive *= Math.exp(-dt / MOTION_SETTINGS.inputDecay);
        const receiving = this.sinceInput < MOTION_SETTINGS.inputHold || this.drive > 0.055;
        if (!this.active) return;
        this.finishing = !receiving;
        const effort = receiving ? 0.48 + Math.sqrt(this.drive) * 0.52 : 0.4;
        this.intensity += (effort - this.intensity) * (1 - Math.exp(-dt / 0.16));
        this.period = MOTION_SETTINGS.slowPeriod
            + (MOTION_SETTINGS.fastPeriod - MOTION_SETTINGS.slowPeriod) * this.drive;
        this.phase += dt / this.period;
        if (this.phase >= 1) {
            this.cycles += 1;
            if (this.finishing) {
                this.stop();
                return;
            }
            this.phase %= 1;
        }
        this.pose = strokePose(this.phase, Math.min(1, this.intensity / 0.5));
        this.distance += dt * this.intensity;
        this.progress = Math.min(1, this.distance / MOTION_SETTINGS.journeySeconds);
    }

    stop() {
        this.active = false;
        this.finishing = false;
        this.phase = 0;
        this.intensity = 0;
        this.drive = 0;
        this.sinceInput = Infinity;
        this.pose = strokePose(0, 0);
    }

    setProgress(progress) {
        this.progress = clamp(progress);
        this.distance = this.progress * MOTION_SETTINGS.journeySeconds;
    }

    get dog() {
        if (!this.active) return { blink: 0, yawn: 0 };
        const blinkCycle = this.cycles % 6 === 1;
        const yawnCycle = this.cycles % 6 === 2;
        const blink = blinkCycle ? channel(this.phase, [[0, 0], [0.15, 0], [0.2, 1], [0.25, 0], [1, 0]]) : 0;
        const yawn = yawnCycle ? channel(this.phase, [[0, 0], [0.18, 0], [0.43, 1], [0.61, 0.9], [0.88, 0], [1, 0]]) : 0;
        return { blink: Math.max(blink, yawn * 0.6), yawn };
    }
}
