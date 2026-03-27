export const EmailOTP = (otp: string) => `
  <div>
    <h1>Your OTP Code</h1>
    <p>Your verification code is: <strong>${otp}</strong></p>
  </div>
`;
