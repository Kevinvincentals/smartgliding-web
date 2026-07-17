// Client-side helpers for the per-device "startbord tablet" designation.
// The active flag + device ID live in localStorage; a window event keeps the
// beacon runner (mounted in the startliste layout) in sync with the settings
// page, mirroring the schoolEnabledChanged pattern.

export const STARTBORD_DEVICE_ID_KEY = 'startbord-device-id'
export const STARTBORD_ACTIVE_KEY = 'startbord-active'
export const STARTBORD_ACTIVE_EVENT = 'startbordActiveChanged'

export function getStartbordDeviceId(): string {
  let deviceId = localStorage.getItem(STARTBORD_DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = crypto.randomUUID()
    localStorage.setItem(STARTBORD_DEVICE_ID_KEY, deviceId)
  }
  return deviceId
}

export function isStartbordActive(): boolean {
  return localStorage.getItem(STARTBORD_ACTIVE_KEY) === 'true'
}

export function setStartbordActive(active: boolean): void {
  localStorage.setItem(STARTBORD_ACTIVE_KEY, String(active))
  window.dispatchEvent(new CustomEvent(STARTBORD_ACTIVE_EVENT, { detail: { active } }))
}
