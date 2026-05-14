export type OTPEmailData = {
  otp: string;
  fullName?: string;
};

export const getOTPEmailSubject = () => "Your EthioSentinel verification code";

export const generateOTPEmailHTML = ({ otp, fullName }: OTPEmailData) => `
  <div>
    <h1>Your EthioSentinel verification code</h1>
    <p>Hello ${fullName ?? "there"},</p>
    <p>Your verification code is: <strong>${otp}</strong></p>
    <p>This code is used to protect your EthioSentinel account.</p>
  </div>
`;

export const EmailOTP = (otp: string) => generateOTPEmailHTML({ otp });
