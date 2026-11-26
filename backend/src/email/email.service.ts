import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Resend } from 'resend';
import sgMail from '@sendgrid/mail';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend = new Resend(process.env.RESEND_API_KEY);

  private async sendSendGridEmail(
    email: string,
    subject: string,
    html: string,
  ) {
    const apiKey = process.env.SENDGRID_API_KEY;
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;

    if (!apiKey || !fromEmail) {
      this.logger.error('SendGrid configuration is missing.');
      throw new InternalServerErrorException(
        'Email service is not configured.',
      );
    }

    try {
      sgMail.setApiKey(apiKey);

      await sgMail.send({
        to: email,
        from: fromEmail,
        subject,
        html,
      });

      return { success: true, provider: 'sendgrid' };
    } catch (error) {
      this.logger.error(
        'SendGrid email delivery failed.',
        error instanceof Error ? error.message : String(error),
      );

      throw new InternalServerErrorException(
        'Unable to send email.',
      );
    }
  }

  async sendOtpEmail(email: string, otp: string) {
    return this.sendSendGridEmail(
      email,
      '24/7 - Email Verification OTP',
      `
        <div style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>Welcome to 24/7!</h2>
          <p>Your email verification OTP is:</p>
          <h1 style="letter-spacing: 8px;">${otp}</h1>
          <p>This OTP is valid for 5 minutes.</p>
          <p>Please do not share your OTP with anyone.</p>
        </div>
      `,
    );
  }

  async sendPasswordResetOtpEmail(email: string, otp: string) {
    return this.sendSendGridEmail(
      email,
      '24/7 - Password Reset OTP',
      `
        <div style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>Password Reset Request</h2>
          <p>We received a request to reset your 24/7 account password.</p>
          <p>Your password reset OTP is:</p>
          <h1 style="letter-spacing: 8px;">${otp}</h1>
          <p>This OTP is valid for 5 minutes.</p>
          <p>If you did not request a password reset, please ignore this email.</p>
          <p>Do not share this OTP with anyone.</p>
        </div>
      `,
    );
  }

  async sendTemporaryPasswordEmail(
    email: string,
    temporaryPassword: string,
  ) {
    return this.sendSendGridEmail(
      email,
      '24/7 - Your Temporary Login Password',
      `
        <div style="font-family: Arial, sans-serif; padding: 24px;">
          <h2>Welcome to 24/7!</h2>
          <p>Your email has been verified successfully.</p>
          <p>Your temporary login password is:</p>
          <h2>${temporaryPassword}</h2>
          <p>Please log in using your registered email and this password.</p>
          <p>For security, please change your password after logging in.</p>
          <p>Do not share this password with anyone.</p>
        </div>
      `,
    );
  }

  async sendNotificationEmail(
    email: string,
    subject: string,
    html: string,
  ) {
    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(
        `[DEV EMAIL] Email: ${email} | Subject: ${subject}`,
      );
      return { success: true, mode: 'development' };
    }

    const { data, error } = await this.resend.emails.send({
      from: '24/7 VPS <alerts@resend.dev>',
      to: [email],
      subject,
      html,
    });

    if (error) {
      this.logger.error(
        `Resend notification error for ${email}:`,
        error,
      );
      return { success: false, error };
    }

    return data;
  }
}
