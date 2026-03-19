/**
 * Lumia Platform Detector
 * Detecta o tipo de Smart TV/browser para aplicar fixes específicos por plataforma.
 */

export const Platform = {
    _cache: null,

    detect() {
        if (this._cache) return this._cache;

        const ua = navigator.userAgent || '';
        let result = { type: 'unknown', isLegacyWebOS: false, isAndroidTV: false, isTizen: false, isPhilips: false };

        if (/Web0S|webOS/i.test(ua)) {
            const verMatch = ua.match(/Web0S[./\s](\d+)/i) || ua.match(/webOS\/(\d+)/i);
            const ver = verMatch ? parseInt(verMatch[1]) : 0;
            result = { type: 'webos', version: ver, isLegacyWebOS: ver < 5, isAndroidTV: false, isTizen: false, isPhilips: false };
        } else if (/Tizen/i.test(ua)) {
            result = { type: 'tizen', isLegacyWebOS: false, isAndroidTV: false, isTizen: true, isPhilips: false };
        } else if (/SMART-TV|SmartTV|Philips/i.test(ua) || /TPVision/i.test(ua)) {
            result = { type: 'philips', isLegacyWebOS: false, isAndroidTV: false, isTizen: false, isPhilips: true };
        } else if (/Android/i.test(ua) && (/TV/i.test(ua) || /AFTM|AFTT|AFTS|Chromecast/i.test(ua))) {
            result = { type: 'android_tv', isLegacyWebOS: false, isAndroidTV: true, isTizen: false, isPhilips: false };
        } else if (/Android/i.test(ua)) {
            // Android WebView genérico (ex: TCL que não reporta "TV" no UA)
            result = { type: 'android_tv', isLegacyWebOS: false, isAndroidTV: true, isTizen: false, isPhilips: false };
        }

        console.log('[Platform]', JSON.stringify(result), '| UA:', ua.substring(0, 80));
        this._cache = result;
        return result;
    },

    get safetyTimeoutMs() {
        const p = this.detect();
        if (p.isAndroidTV) return 25000; // Android TV tem WebView mais lento para iniciar buffer
        if (p.isLegacyWebOS) return 15000; // WebOS 4.x é lento mas o JIT Blob acelera
        return 10000; // Padrão (Samsung Tizen, outros)
    },

    get requiresExplicitLoad() {
        // Android WebView exige video.load() após mudar src
        return this.detect().isAndroidTV;
    },

    get useJITBlob() {
        // JIT Blob URL previne stall do SW em WebOS
        // Em Android TV, o SW funciona melhor — JIT blob desnecessário e adiciona latência
        return this.detect().isLegacyWebOS;
    }
};
