import crypto from 'crypto';

/**
 * Generates a secure numeric OTP of a specified length.
 * 
 * @param length - The number of digits for the OTP (default is 6)
 * @returns A string containing the random OTP
 */
export const generateOtp = (length: number = 6): string => {
  if (length <= 0) {
    throw new Error('OTP length must be greater than 0');
  }

  let otp = '';
  
  // Generate each digit securely
  for (let i = 0; i < length; i++) {
    // crypto.randomInt(min, max) generates a number from min (inclusive) to max (exclusive)
    otp += crypto.randomInt(0, 10).toString();
  }

  return otp;
};
