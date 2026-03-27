export class EmailSender {
  static async sendEmail(to: string, subject: string, template: string, data: any) {
    console.log(`Sending email to ${to} with subject: ${subject}`);
    // Implementation for sending email (e.g., using Nodemailer or SendGrid)
  }

  static async sendOTP(to: string, otp: string) {
    return this.sendEmail(to, "Your OTP Code", "EmailOTP", { otp });
  }

  static async sendResetPassword(to: string, token: string) {
    return this.sendEmail(to, "Reset Your Password", "reset-password", { token });
  }
}
