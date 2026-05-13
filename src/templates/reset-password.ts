export type ResetPasswordEmailData = {
  resetUrl: string;
  fullName?: string;
  validityMinutes?: number;
};

export const getResetPasswordEmailSubject = () => "Reset your EthioSentinel password";

export const generateResetPasswordEmailHTML = ({
  resetUrl,
  fullName,
  validityMinutes = 10,
}: ResetPasswordEmailData) => `
  <div>
    <h1>Reset Your Password</h1>
    <p>Hello ${fullName ?? "there"},</p>
    <p>Click <a href="${resetUrl}">here</a> to reset your password.</p>
    <p>This link expires in ${validityMinutes} minutes.</p>
  </div>
`;

export const ResetPasswordTemplate = (token: string) =>
  generateResetPasswordEmailHTML({
    resetUrl: `${process.env.FRONTEND_URL || process.env.CLIENT_URL || "http://localhost:5173"}/reset-password/${token}`,
  });
