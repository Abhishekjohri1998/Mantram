export class ConcurrencyLimiter {
    constructor(maxConcurrent = 8) {
        this.max = maxConcurrent;
        this.active = 0;
        this.queue = [];
    }
    async acquire() {
        if (this.active < this.max) {
            this.active++;
            return;
        }
        await new Promise(resolve => this.queue.push(resolve));
    }
    release() {
        this.active--;
        if (this.queue.length > 0) {
            this.active++;
            const next = this.queue.shift();
            next();
        }
    }
}

export const generationLimiter = new ConcurrencyLimiter(8);
