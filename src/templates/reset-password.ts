export const ResetPasswordTemplate = (token: string) => `
  <div>
    <h1>Reset Your Password</h1>
    <p>Click <a href="https://yourapp.com/reset-password?token=${token}">here</a> to reset your password.</p>
  </div>
`;
