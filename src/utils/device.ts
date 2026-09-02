/**
 * How a device value is written on this page — `pos` is an initialism, the rest are words.
 *
 * Lives on its own because the registry band and the table both render device values and a
 * plain CSS `capitalize` disagrees with the band's rule on exactly one value: it produces
 * `Pos` where the band says `POS`, one card apart on the same screen.
 */
export const formatDevice = (device: string) =>
  device === 'pos' ? 'POS' : device.charAt(0).toUpperCase() + device.slice(1);
