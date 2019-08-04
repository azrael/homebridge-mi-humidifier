const miio = require('miio');

const defaultLog = {
    error: () => {}
};

// const knownProps = ['power', 'humidity', 'child_lock', 'dry', 'depth', 'limit_hum']
//     .reduce((memo, prop) => ({ ...memo, [prop]: true }), {});

class Humidifier {
    constructor(address, token, model, options = {}) {
        let { log = defaultLog } = options;

        this.device = new miio.Device({ address, token });
        this.log = log;
        this.model = model;
    }

    async get(props = []) {
        try {
            return [null, await this.device.call('get_prop', props)];
        } catch (err) {
            this.log.error(`Error while getting properties: ${props}\n`, err);

            return [err];
        }
    }

    async set(prop, value) {
        try {
            let [res] = await this.device.call(`set_${prop}`, [value]);

            if (res !== 'ok') throw new Error(res);

            return [null, res];
        } catch (err) {
            this.log.error(`Error while setting property ${prop}\n`, err);

            return [err];
        }
    }

    control(prop, ...args) {
        return args.length === 0 ? this.get([prop]) : this.set(prop, args[0]);
    }

    power(...args) {
        return this.control('power', ...args);
    }

    mode(...args) {
        return this.control('mode', ...args);
    }

    dry(...args) {
        return this.control('dry', ...args);
    }

    lock(...args) {
        return this.control('child_lock', ...args);
    }

    async waterLevel() {
        let [err, value] = await this.get(['depth']);

        return [err, !err && value / 1.2];
    }

    humidity() {
        return this.get(['humidity']);
    }

    targetHumidity(...args) {
        return this.control('limit_hum', ...args);
    }

    async temperature() {
        let prop = this.model === 'cb1' ? 'temperature' : 'temp_dec',
            [err, value] = await this.get([prop]),
            res = !err && (this.model === 'cb1' ? value : value / 10);

        return [err, res];
    }
}
