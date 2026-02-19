export const generatePairingCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = ''
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return code
}

export const getDeviceId = () => {
    let deviceId = localStorage.getItem('lumends_device_id')
    if (!deviceId) {
        // UUID v4 Generator Polyfill
        deviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8)
            return v.toString(16)
        })
        localStorage.setItem('lumends_device_id', deviceId)
    }
    return deviceId
}
