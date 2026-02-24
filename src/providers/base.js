export class BaseProvider {
    config;
    constructor(config) {
        this.config = config;
    }
    getAuthHeader() {
        return `Bearer ${this.config.apiKey}`;
    }
}
