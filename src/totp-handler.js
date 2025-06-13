const crypto = require('crypto');

/**
 * Generate a TOTP code from a secret
 * Compatible with Google Authenticator and similar apps
 */
function generateTOTP(secret, options = {}) {
  const {
    period = 30,
    digits = 6,
    algorithm = 'sha1',
    timestamp = Date.now()
  } = options;

  // Convert base32 secret to buffer
  const buffer = base32ToBuffer(secret);
  
  // Calculate time counter
  const counter = Math.floor(timestamp / 1000 / period);
  
  // Create 8-byte buffer from counter
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeUInt32BE(0, 0);
  counterBuffer.writeUInt32BE(counter, 4);
  
  // Generate HMAC
  const hmac = crypto.createHmac(algorithm, buffer);
  hmac.update(counterBuffer);
  const hash = hmac.digest();
  
  // Extract dynamic binary code
  const offset = hash[hash.length - 1] & 0xf;
  const code = (hash[offset] & 0x7f) << 24 |
               (hash[offset + 1] & 0xff) << 16 |
               (hash[offset + 2] & 0xff) << 8 |
               (hash[offset + 3] & 0xff);
  
  // Generate final OTP
  const otp = code % Math.pow(10, digits);
  return otp.toString().padStart(digits, '0');
}

/**
 * Convert base32 string to buffer
 */
function base32ToBuffer(base32) {
  // Remove spaces and convert to uppercase
  base32 = base32.replace(/\s/g, '').toUpperCase();
  
  const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = base32.split('').map(char => {
    const index = base32Chars.indexOf(char);
    if (index === -1) {
      throw new Error(`Invalid base32 character: ${char}`);
    }
    return index.toString(2).padStart(5, '0');
  }).join('');
  
  // Convert bits to bytes
  const bytes = [];
  for (let i = 0; i < bits.length; i += 8) {
    if (i + 8 <= bits.length) {
      bytes.push(parseInt(bits.substr(i, 8), 2));
    }
  }
  
  return Buffer.from(bytes);
}

module.exports = {
  generateTOTP
};